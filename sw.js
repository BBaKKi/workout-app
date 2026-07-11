/* 운동 루틴 PWA 서비스워커 — network-first 전략.
   온라인이면 항상 네트워크(=GitHub Pages 최신 배포)를 우선하고 성공 응답으로 캐시를 갱신,
   오프라인일 때만 캐시로 폴백한다. cache-first와 달리 배포 후 옛 버전이 고착되지 않으므로
   push만 하면 되는 현재 워크플로우를 그대로 유지할 수 있다. */
const CACHE = 'fit-tracker-v1'; // 캐시 스키마가 바뀔 때만 올리면 됨 (network-first라 콘텐츠 갱신엔 불필요)
const PRECACHE = ['./', './index.html', './exercise-library.js', './manifest.json', './icon192.png', './icon512.png'];
const NET_TIMEOUT_MS = 4000; // 느린 네트워크에서 이 시간 안에 응답 없으면 캐시로 폴백 (오프라인급 반응성)

self.addEventListener('install', e => {
  // allSettled: 파일 1개가 404여도(아이콘 교체 등) 나머지 프리캐시와 SW 설치는 진행.
  // addAll은 하나만 실패해도 설치 전체가 실패해 오프라인 지원이 통째로 죽는다.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
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
  e.respondWith((async () => {
    try {
      const netP = fetch(req);
      netP.catch(() => {}); // 타임아웃 패배 후 늦게 실패해도 unhandled rejection 방지
      const res = await Promise.race([
        netP,
        new Promise((_, rej) => setTimeout(() => rej(new Error('net-timeout')), NET_TIMEOUT_MS))
      ]);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    } catch (_) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const idx = await caches.match('./index.html');
        if (idx) return idx;
      }
      return Response.error();
    }
  })());
});
