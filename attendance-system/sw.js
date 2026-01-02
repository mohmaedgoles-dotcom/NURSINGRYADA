const CACHE_NAME = '7odorak-v2-safe'; // غيرنا الاسم عشان يجبر المتصفح يحدث الكاش
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js'
  // تم تعليق باقي الملفات مؤقتاً لحد ما ترفعهم على GitHub
  // './manifest.json',
  // './icon.png',
  // './face-api.min.js',
  // './models/tiny_face_detector_model-weights_manifest.json',
  // './models/tiny_face_detector_model-shard1',
  // ... وباقي ملفات المودلز
];

// 1. تثبيت التطبيق وتخزين الملفات المتاحة فقط
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تفعيل التحديث فوراً
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching essential assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. تفعيل السيرفر ووركر وحذف الكاش القديم (تنظيف)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim(); // السيطرة على الصفحة فوراً
});

// 3. استدعاء الملفات (Offline First Strategy)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // لو الملف في الكاش هاته، لو مش موجود هاته من النت
      return response || fetch(event.request).catch(() => {
        // لو مفيش نت والملف مش في الكاش، ممكن نرجع صفحة بديلة (اختياري)
        // return caches.match('./offline.html'); 
      });
    })
  );
});
