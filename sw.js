// 全国お水取りマップ Service Worker
const CACHE = "omizu-v2";
const CORE = [
  "./",
  "index.html",
  "css/style.css",
  "js/data.js",
  "js/geo.js",
  "js/koyomi.js",
  "js/kigaku.js",
  "js/ban.js",
  "js/themes.js",
  "js/app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // お知らせ(と将来のシートCSV)は常に最新を優先、オフライン時のみキャッシュ
  if (url.pathname.endsWith("announce.csv") || url.hostname.includes("docs.google.com")) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 同一オリジンはキャッシュ優先(音源なども一度聴けばオフライン再生可)
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
    );
  }
  // 地図タイル・CDNはブラウザに任せる(キャッシュしない)
});
