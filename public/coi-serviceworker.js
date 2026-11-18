/*! Lightweight COOP/COEP Service Worker for GitHub Pages multi-threaded WASM */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 0) return res;
        const headers = new Headers(res.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      })
      .catch((e) => {
        console.error(e);
        return new Response(null, { status: 500 });
      })
  );
});
