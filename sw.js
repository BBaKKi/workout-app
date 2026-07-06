/* 운동 루틴 PWA 서비스워커 — network-first 전략.
   온라인이면 항상 네트워크(=GitHub Pages 최신 배포)를 우선하고 성공 응답으로 캐시를 갱신,
   오프라인일 때만 캐시로 폴백한다. cache-first와 달리 배포 후 옛 버전이 고착되지 않으므로
   push만 하면 되는 현재 워크플로우를 그대로 유지할 수 있다. */
const CACHE = 'fit-tracker-v1'; // 캐시 스키마가 바뀔 때만 올리면 됨 (network-first라 콘텐츠 갱신엔 불필요)
const PRECACHE = ['./', './index.html', './exercise-library.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // GET만 처리 — Apps Script 동기화(POST) 등은 그대로 통과
  if (req.method !== 'GET') return;
  // 동일 출처만 캐시 — 외부 요청(스크립트 URL 등)은 네트워크 직행
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});
