#!/usr/bin/env node
/**
 * ดึงฟอนต์ Prompt มา self-host เอง แทนการโหลดจาก Google Fonts ตอน runtime
 *
 *   npm run build:fonts
 *
 * ทำไมถึงคุ้ม:
 *   1. ตัด origin ภายนอกทิ้ง 2 เจ้า (fonts.googleapis.com + fonts.gstatic.com)
 *      แต่ละเจ้าต้องเสีย DNS + TCP + TLS handshake ก่อนได้ไบต์แรก ซึ่งบนเน็ตช้าคือหลายร้อย ms
 *   2. ตัด waterfall: เดิมต้องโหลด CSS จาก googleapis ให้เสร็จก่อน ถึงจะรู้ URL ของไฟล์ฟอนต์
 *      ที่อยู่บน gstatic แล้วค่อยเริ่มโหลดฟอนต์ — เป็นการรอสองต่อ
 *   3. เลือกเฉพาะน้ำหนัก/ชุดตัวอักษรที่ใช้จริง
 *
 * น้ำหนักที่เอา: 400,500,600,700,800,900 + italic 400
 *   ตัด 300 ออกเพราะนับแล้วทั้งโปรเจกต์ไม่มี font-light ใช้เลยสักครั้ง
 *   (ถ้าจะเริ่มใช้ 300 ต้องเพิ่มใน WEIGHTS แล้วรันใหม่ ไม่งั้นเบราว์เซอร์จะสังเคราะห์เอง ตัวจะดูผิดเพี้ยน)
 *
 * ชุดตัวอักษรที่เอา: thai + latin
 *   ตัด vietnamese กับ latin-ext ทิ้ง — ระบบเป็นภาษาไทยล้วน ส่วนอังกฤษที่ใช้เป็น ASCII พื้นฐาน
 *   (ชื่อรุ่นสินค้าอย่าง iPhone / Samsung) เบราว์เซอร์เลือกโหลดตาม unicode-range อยู่แล้ว
 *   การตัดออกจึงไม่ได้ลดไบต์ตอน runtime แต่ลดไฟล์ที่ต้องเก็บและดูแล
 *
 * ⚠️ ต้องต่อเน็ตตอนรัน (ดึงจาก Google ครั้งเดียวตอน build เท่านั้น)
 * ⚠️ บัมพ์ ?v= ของ prompt.css ใน index.html ทุกครั้งที่รันใหม่
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'vendor', 'fonts');

const WEIGHTS = '0,400;0,500;0,600;0,700;0,800;0,900;1,400';
const KEEP_SUBSETS = ['thai', 'latin'];
const CSS_URL = `https://fonts.googleapis.com/css2?family=Prompt:ital,wght@${WEIGHTS}&display=swap`;
// ต้องส่ง UA ของเบราว์เซอร์จริง ไม่งั้น Google จะส่ง CSS ที่อ้างฟอนต์ฟอร์แมตเก่า (ttf) กลับมาแทน woff2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const fetch = (url, binary = false) => new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
        if (res.statusCode !== 200) return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
});

(async () => {
    fs.mkdirSync(outDir, { recursive: true });

    const css = await fetch(CSS_URL);
    const faces = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)];
    if (!faces.length) throw new Error('อ่าน @font-face จาก Google Fonts ไม่ได้ — รูปแบบ CSS อาจเปลี่ยน');

    const out = [];
    let total = 0, kept = 0;

    for (const [, subset, body] of faces) {
        if (!KEEP_SUBSETS.includes(subset)) continue;

        const url = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
        const weight = body.match(/font-weight:\s*(\d+)/)?.[1];
        const style = body.match(/font-style:\s*(\w+)/)?.[1] || 'normal';
        const range = body.match(/unicode-range:\s*([^;]+);/)?.[1];
        if (!url || !weight || !range) throw new Error(`แยกข้อมูล @font-face ไม่ได้ (subset ${subset})`);

        const file = `prompt-${subset}-${weight}${style === 'italic' ? 'i' : ''}.woff2`;
        const buf = await fetch(url, true);
        fs.writeFileSync(path.join(outDir, file), buf);
        total += buf.length;
        kept++;

        out.push(
            `/* ${subset} */\n@font-face {\n  font-family: 'Prompt';\n  font-style: ${style};\n` +
            `  font-weight: ${weight};\n  font-display: swap;\n  src: url(${file}) format('woff2');\n` +
            `  unicode-range: ${range.trim()};\n}`
        );
    }

    const header = `/* สร้างอัตโนมัติโดย tools/build-fonts.js — อย่าแก้ไฟล์นี้โดยตรง\n` +
        `   น้ำหนัก: ${WEIGHTS}  |  ชุดตัวอักษร: ${KEEP_SUBSETS.join(', ')}\n` +
        `   แก้แล้วรัน: npm run build:fonts */\n\n`;
    fs.writeFileSync(path.join(outDir, 'prompt.css'), header + out.join('\n\n') + '\n');

    console.log(`ดาวน์โหลด ${kept} ไฟล์ (จาก ${faces.length} ที่ Google เสิร์ฟ) รวม ${(total / 1024).toFixed(1)} KB`);
    console.log(`ตัดทิ้ง: ${faces.length - kept} ไฟล์ (subset ที่ไม่ใช้ + น้ำหนัก 300)`);
    console.log(`เขียน vendor/fonts/prompt.css แล้ว`);

    // ตรวจว่าไฟล์ที่ CSS อ้างถึงมีอยู่จริงครบ
    const finalCss = fs.readFileSync(path.join(outDir, 'prompt.css'), 'utf8');
    const missing = [...finalCss.matchAll(/url\(([^)]+\.woff2)\)/g)]
        .map(m => m[1])
        .filter(f => !fs.existsSync(path.join(outDir, f)));
    if (missing.length) {
        console.error('❌ CSS อ้างถึงไฟล์ที่ไม่มีอยู่:', missing.join(', '));
        process.exit(1);
    }
    console.log('✅ ไฟล์ฟอนต์ที่ CSS อ้างถึง มีครบทุกไฟล์');
})().catch(err => { console.error(err); process.exit(1); });
