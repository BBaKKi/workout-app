/* 운동 루틴 PWA 서비스워커 — stale-while-revalidate 전략.
   캐시가 있으면 즉시 캐시로 응답(콜드 스타트 ~0.1초)하고, 백그라운드에서 네트워크로 갱신한다.
   갱신 결과가 기존 캐시와 다르면(ETag/Last-Modified 비교) 클라이언트에 'sw-updated' 메시지를 보내
   index.html이 "새 버전" 토스트를 띄운다. network-first 대비: 느린 네트워크에서 최대 4초 기다리던
   실행 지연이 사라지고, 배포 반영은 토스트 새로고침 또는 다음 실행에 이뤄진다. */
const CACHE = 'fit-tracker-v9-20261012'; // 파일 구성이 바뀌면 버전을 올립니다.
const CORE = ['./', './index.html', './exercise-library.js', './training-plan.js', './app-enhancements.js', './app-enhancements.css', './manifest.json'];
const OPTIONAL = ['./icon192.png', './icon512.png'];

self.addEventListener('install', e => {
  // 필수 코드가 모두 준비된 경우에만 새 버전으로 전환합니다. 아이콘은 기존 배포 파일을 사용합니다.
  e.waitUntil(
    caches.open(CACHE)
      .then(async c => { await c.addAll(CORE); await Promise.allSettled(OPTIONAL.map(u => c.add(u))); })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('fit-tracker-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 배포본 변경 감지: GitHub Pages가 주는 ETag(없으면 Last-Modified, 그것도 없으면 content-length)로 비교.
// 본문 해시보다 훨씬 싸고, 재배포 시 헤더가 반드시 바뀐다.
function _ver(res) {
  return res.headers.get('etag') || res.headers.get('last-modified') || res.headers.get('content-length') || '';
}

async function _revalidate(req, cached) {
  try {
    const res = await fetch(req);
    if (!res || !res.ok) return;
    const changed = cached && _ver(cached) !== _ver(res);
    await (await caches.open(CACHE)).put(req, res.clone());
    // index.html(내비게이션)이 바뀐 경우에만 알림 — 부속 파일 갱신으로 토스트가 남발되지 않게
    if (changed && (req.mode === 'navigate' || /index\.html$/.test(new URL(req.url).pathname))) {
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(c => c.postMessage({ type: 'sw-updated' }));
    }
  } catch (_) { /* 오프라인 — 다음 기회에 */ }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  // GET만 처리 — Apps Script 동기화(POST) 등은 그대로 통과
  if (req.method !== 'GET') return;
  // 동일 출처만 캐시 — 외부 요청(스크립트 URL 등)은 네트워크 직행
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req) ||
      (req.mode === 'navigate' ? await caches.match('./index.html') : null);
    if (cached) {
      // 즉시 캐시 응답 + 백그라운드 갱신 (SW 수명 보장 위해 waitUntil)
      e.waitUntil(_revalidate(req, cached));
      return cached;
    }
    // 캐시 미스(첫 방문·새 파일): 네트워크 직행, 성공 시 캐시에 적재
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    } catch (_) {
      return Response.error();
    }
  })());
});
