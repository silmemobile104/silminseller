// Service Worker: cache asset คงที่ (css/js/font/icon/รูป/views fragment) ไว้ฝั่งเครื่อง
// เป้าหมาย: เข้าเว็บครั้งถัดไปเร็วขึ้นมาก โดยเฉพาะตอนเน็ตช้าหรือหลุดชั่วคราว
// ไม่แตะ /api/ เด็ดขาด — ข้อมูลธุรกิจ (สต็อก/ยอดขาย/ราคา) ต้องสดใหม่จากเซิร์ฟเวอร์เสมอ

const CACHE_NAME = 'silminseller-static-v1';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // ลบแคชเวอร์ชันเก่าทิ้ง (เผื่ออนาคตบัมพ์ CACHE_NAME เวลาปรับ logic การแคช)
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // เฉพาะ GET เท่านั้น — POST/PUT/DELETE (บันทึกข้อมูล) ปล่อยผ่านตามปกติเสมอ
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // ข้าม request ข้ามโดเมนทั้งหมด (Google Fonts, cdnjs xlsx ฯลฯ) ให้เบราว์เซอร์จัดการแคชเองตามปกติ
    if (url.origin !== self.location.origin) return;

    // ไม่แคช API เด็ดขาด — ข้อมูลธุรกิจต้องสดใหม่เสมอ ไม่มีทางแคชได้อย่างปลอดภัย
    if (url.pathname.startsWith('/api/')) return;

    // หน้า HTML หลัก (navigation): network-first แล้วค่อย fallback เป็นแคชล่าสุดตอนออฟไลน์
    // ต้องพยายามโหลดของใหม่ก่อนเสมอเพราะ index.html คือตัวประกาศ ?v= ให้ asset อื่นทั้งหมด
    // fallback เป็นแคชไว้กันเจอหน้า browser error เปล่าๆ เวลาเน็ตหลุดสนิท
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request).then((cached) => cached || Response.error()))
        );
        return;
    }

    // Asset คงที่อื่นๆ ทั้งหมด (css/js/font/icon/รูป/views fragment ฯลฯ): stale-while-revalidate
    // ตอบจากแคชทันทีถ้ามี (เร็วสุด ไม่ต้องรอเน็ตเลย) แล้วค่อย fetch ของใหม่แช่ไว้ในแคชเงียบๆ สำหรับครั้งถัดไป
    // เผื่อไฟล์ไม่มี ?v= กำกับ (เช่น logo.png) การ revalidate เบื้องหลังนี้ทำให้สุดท้ายก็ได้ของใหม่ ไม่ค้างตลอดไป
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(request);
            const networkFetch = fetch(request)
                .then((response) => {
                    if (response && response.ok) cache.put(request, response.clone());
                    return response;
                })
                .catch(() => null);

            return cached || (await networkFetch) || Response.error();
        })
    );
});
