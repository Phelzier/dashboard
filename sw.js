const CACHE_NAME = 'mlp-dashboard-cache-v1';
const PRECACHE_URLS = ['./', './style.css', './dashboard.js'];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(PRECACHE_URLS);
        })
    );
});

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') { return; }
    event.respondWith(
        fetch(event.request).then(function(networkResponse) {
            // Successful online load - refresh the cache with this latest copy so "last data" always
            // means the most recent thing actually seen, not a stale install-time snapshot.
            var responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
                cache.put(event.request, responseClone);
            });
            return networkResponse;
        }).catch(function() {
            // Network failed (offline) - serve whatever was last cached, if anything. Falls back to the
            // page shell itself only as a last resort (e.g. a thumbnail image with no cached entry yet),
            // not as the default for every miss - that would silently substitute the wrong content type.
            return caches.match(event.request).then(function(cachedResponse) {
                return cachedResponse || caches.match('./');
            });
        })
    );
});