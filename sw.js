/* 운동 루틴 PWA 서비스워커 — network-first + 타임아웃 폴백.
   온라인이면 항상 네트워크(=GitHub Pages 최신 배포)를 우선하고 성공 응답으로 캐시를 갱신,
   오프라인이거나 네트워크가 NET_TIMEOUT_MS 안에 응답하지 못하면 캐시로 폴백한다.
   (타임아웃으로 캐시를 반환한 뒤에도 늦게 도착한 네트워크 응답은 캐시에 반영 → 다음 로드는 최신)
   cache-first와 달리 배포 후 옛 버전이 고착되지 않으므로 push만 하면 되는 워크플로우 유지. */
const CACHE = 'fit-tracker-v2'; // 프리캐시 구성 변경(아이콘 리네임) — v1은 activate에서 삭제됨
const NET_TIMEOUT_MS = 3000;    // 짐 와이파이 등 '연결은 됐지만 느린' 상태에서 캐시 폴백까지의 대기 상한
const PRECACHE = ['./', './index.html', './exercise-library.js', './manifest.json', './icon192.png', './icon512.png'];

self.addEventListener('install', e => {
  // addAll은 1개만 404여도 설치 전체가 실패 → Promise.allSettled로 개별 캐시(부분 실패 허용)
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
  // 네트워크 요청은 즉시 시작 — 성공(ok) 응답은 어떤 경로로 응답했든 캐시에 반영
  const net = fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  });
  const netSafe = net.catch(() => null); // 실패는 null로 정규화(미처리 rejection 방지)
  e.respondWith((async () => {
    // 네트워크 vs 타임아웃 레이스 — 제시간에 온 응답(비-ok 포함, 기존 의미 유지)은 그대로 반환
    const first = await Promise.race([
      netSafe,
      new Promise(r => setTimeout(() => r('TIMEOUT'), NET_TIMEOUT_MS))
    ]);
    if (first && first !== 'TIMEOUT') return first;
    // 타임아웃 또는 네트워크 실패 → 캐시 폴백
    const hit = await caches.match(req);
    if (hit) return hit;
    // 캐시도 없으면(첫 방문 등) 네트워크를 끝까지 기다린다
    const late = await netSafe;
    if (late) return late;
    return req.mode === 'navigate' ? caches.match('./index.html') : Response.error();
  })());
});
