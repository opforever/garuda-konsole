/* Garuda Konsole 4.0 — Service Worker
   Caches the app shell for instant launch, and handles Web Push so you get
   notifications even with the browser fully closed. */
'use strict';

const CACHE = 'garuda-konsole-v5.3.1';
const SHELL = [
    '/',
    '/index.html',
    /* Versioned asset URLs: a stale service worker from an older release can
       never have these in cache, so the first load after a deploy fetches the
       fresh CSS/JS from the network instead of resurrecting old styles. */
    '/style.css?v=5.3.1',
    '/app.js?v=5.3.1',
    '/ui.js?v=5.3.1',
    '/manifest.webmanifest',
    '/replay.html',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
    'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css',
    'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js',
    'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js',
    'https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js',
    'https://cdn.jsdelivr.net/npm/xterm-addon-search@0.13.0/lib/xterm-addon-search.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Never cache API endpoints, uploads, downloads or share-target posts
    if (url.pathname.startsWith('/api/') || url.pathname === '/upload' ||
        url.pathname === '/download' || url.pathname === '/share-upload') return;

    // Network-first for navigations (terminal must be live), cached shell when offline
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(() => caches.match('/index.html').then((r) => r || Response.error()))
        );
        return;
    }

    // Cache-first for static assets & CDN libs, refreshing the cache in the background
    event.respondWith(
        caches.match(req).then((cached) => {
            const network = fetch(req)
                .then((res) => {
                    if (res && (res.status === 200 || res.type === 'opaque')) {
                        const copy = res.clone();
                        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});

/* ─────────────── Web Push ─────────────── */

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Garuda Konsole', body: event.data ? event.data.text() : '' };
    }
    const title = data.title || 'Garuda Konsole';
    event.waitUntil(
        self.registration.showNotification(title, {
            body: data.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: data.tag || 'garuda',
            renotify: false,
            vibrate: [120, 60, 120],
            data: { url: data.url || '/' }
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil((async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of all) {
            if ('focus' in client && client.url.includes(new URL(url, self.location).host)) {
                await client.focus();
                try { client.navigate(url); } catch (e) {}
                return;
            }
        }
        if (self.clients.openWindow) await self.clients.openWindow(url);
    })());
});
