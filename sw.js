// TaskPulse Service Worker v3.0
const CACHE_NAME = 'taskpulse-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Noto+Sans+Bengali:wght@300;400;500;600;700&display=swap'
];

// ─── Install: Cache all assets ───────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate: Clean old caches ─────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: Network-first for HTML, cache-first for rest ───
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate' || e.request.url.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ─── Task storage inside the Service Worker ─────────────
let scheduledTasks = [];
let checkTimer = null;

// Receive task list from the page (index.html sends this whenever tasks change)
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SYNC_TASKS') {
    scheduledTasks = e.data.tasks || [];
    startChecking();
  }
  if (e.data && e.data.type === 'STOP_CHECK') {
    if (checkTimer) clearInterval(checkTimer);
  }
});

function startChecking() {
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(checkDueTasks, 15000); // check every 15s
  checkDueTasks();
}

function checkDueTasks() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const nowStr = `${hh}:${mm}`;
  const today = now.getDay(); // 0=Sun..6=Sat

  scheduledTasks.forEach(task => {
    if (task.done) return;
    if (task.time !== nowStr) return;

    // avoid duplicate fire within same minute
    const fireKey = `${task.id}_${now.toDateString()}_${nowStr}`;
    if (task._lastFired === fireKey) return;
    task._lastFired = fireKey;

    if (task.repeat === 'once' || task.repeat === 'daily' ||
        (task.repeat === 'weekdays' && today >= 1 && today <= 5)) {
      self.registration.showNotification('⏰ ' + (task.name || 'TaskPulse'), {
        body: 'রিমাইন্ডার সময় হয়েছে!',
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        tag: 'taskpulse-' + task.id,
        renotify: true
      });
    }
  });
}

// ─── Push Notification (future use with real backend) ───
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  self.registration.showNotification(data.title || '⏰ TaskPulse', {
    body: data.body || 'রিমাইন্ডার!',
    icon: data.icon || './icon-192.png',
    badge: './icon-192.png',
    requireInteraction: true
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientsArr => {
      if (clientsArr.length > 0) return clientsArr[0].focus();
      return clients.openWindow('./');
    })
  );
});
