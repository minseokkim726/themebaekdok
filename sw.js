// 서비스 워커: 앱 파일을 기기에 담아 두고 네트워크 없이도 열리게 한다.
// 앱 파일을 고쳐 다시 올릴 때는 반드시 VERSION을 올린다. 새 버전은 파일 묶음 전체를 한 번에 받아 두고,
// 묶음 안에서만 꺼내 쓴다(옛 파일과 새 파일이 섞여 앱이 멈추는 일을 막기 위해 파일별 뒤늦은 갱신은 하지 않는다).
const VERSION = 'v1.5.1'; // js/version.js의 APP_VERSION과 같게
const CACHE = `themebaekdok-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/repo.js',
  'js/rules.js',
  'js/format.js',
  'js/version.js',
  'js/screens/shared.js',
  'js/screens/today.js',
  'js/screens/status.js',
  'js/screens/week.js',
  'js/screens/addBook.js',
  'js/screens/finish.js',
  'js/screens/settings.js',
  'js/screens/categories.js',
  'js/screens/category.js',
  'js/screens/recs.js',
  'js/screens/preview.js',
  'js/screens/stats.js',
  'js/screens/topic.js',
  'js/screens/projectFlow.js',
  'js/screens/newProject.js',
  'js/screens/history.js',
  'js/screens/bookActions.js',
  'js/screens/outside.js',
  'js/screens/book.js',
  'js/screens/memo.js',
  'data/recommendations-seed.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('themebaekdok-') && k !== CACHE).map((k) => caches.delete(k)))),
      // clients.claim()은 쓰지 않는다: 열리는 중인 화면을 도중에 새 버전으로 바꾸면 파일이 섞일 수 있다.
  );
});

// 이 버전의 묶음에 있으면 그것을 쓰고(빠르게 열림), 없을 때만 네트워크에서 받는다.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 앱 첫 화면(./ 또는 index.html)을 여는 요청만 담아 둔 index.html로 답한다.
  // 다른 페이지(tests.html 등)는 각자 주소로 담아 두어 서로 덮어쓰지 않게 한다.
  const scopePath = new URL(self.registration.scope).pathname;
  const isShell = req.mode === 'navigate' && (url.pathname === scopePath || url.pathname === `${scopePath}index.html`);
  const key = isShell ? new URL('index.html', self.registration.scope).href : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: isShell });
    if (cached) return cached;
    const res = await fetch(req).catch(() => null);
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(cache.put(key, copy));
      return res;
    }
    return res || new Response('오프라인입니다. 네트워크에 연결한 뒤 다시 열어 주세요.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
