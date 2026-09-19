#!/usr/bin/env node
/**
 * ดึงฟอนต์ของระบบมา self-host เอง แทนการโหลดจาก Google Fonts ตอน runtime
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
 * ลำดับฟอนต์ของระบบ (ดู --font-family ใน style.css):
 *     'Sarabun', 'Prompt', 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif
 *
 *   Sarabun = ตัวหลัก (ไทย + ละติน)
 *   Prompt  = ตัวสำรองตัวแรก (ไทย + ละติน) ของเดิมของระบบ
 *   Outfit  = ตัวสำรองตัวที่สอง มีเฉพาะละติน ไม่มีไทย
 *
 *   ⚠️ ในทางปฏิบัติ Outfit แทบไม่ถูกเรียกใช้เลย เพราะ Sarabun ครอบคลุมทั้งไทยและละตินอยู่แล้ว
 *      เบราว์เซอร์จะไล่ไปตัวถัดไปเฉพาะ "ตัวอักษรที่ตัวก่อนหน้าไม่มี" เท่านั้น ไม่ใช่ทั้งหน้า
 *      ที่ยังดึงมาเก็บไว้เพราะประกาศชื่อไว้ในลำดับฟอนต์แล้ว ควรมีไฟล์จริงรองรับ
 *      และไฟล์พวกนี้ไม่ถูกดาวน์โหลดตอน runtime ถ้าไม่มีตัวอักษรไหนต้องใช้ (จึงไม่กินแบนด์วิดท์ผู้ใช้)
 *
 * น้ำหนักที่เอา: 400,500,600,700,800,900 + italic 400
 *   ตัด 300 ออกเพราะนับแล้วทั้งโปรเจกต์ไม่มี font-light ใช้เลยสักครั้ง
 *   (ถ้าจะเริ่มใช้ 300 ต้องเพิ่มใน weights ของทุกตระกูลแล้วรันใหม่ ไม่งั้นเบราว์เซอร์จะสังเคราะห์เอง)
 *
 *   ⚠️ Sarabun ไม่มีน้ำหนัก 900 (Google มีให้ถึง 800 เท่านั้น) — ตัว font-black ของระบบ
 *      จึงเรนเดอร์ด้วย Sarabun 800 ซึ่งเป็นน้ำหนักที่ใกล้ที่สุดในตระกูลเดียวกัน
 *      เบราว์เซอร์ "ไม่" ข้ามไปหยิบ 900 ของ Prompt ให้ เพราะการจับคู่น้ำหนักทำภายในตระกูลที่เจอก่อน
 *   ⚠️ Outfit ไม่มีตัวเอียง (ไม่มีแกน italic) จึงดึงเฉพาะ style ปกติ
 *
 * ชุดตัวอักษรที่เอา: thai + latin
 *   ตัด vietnamese กับ latin-ext ทิ้ง — ระบบเป็นภาษาไทยล้วน ส่วนอังกฤษที่ใช้เป็น ASCII พื้นฐาน
 *   (ชื่อรุ่นสินค้าอย่าง iPhone / Samsung) เบราว์เซอร์เลือกโหลดตาม unicode-range อยู่แล้ว
 *   การตัดออกจึงไม่ได้ลดไบต์ตอน runtime แต่ลดไฟล์ที่ต้องเก็บและดูแล
 *
 * ⚠️ ต้องต่อเน็ตตอนรัน (ดึงจาก Google ครั้งเดียวตอน build เท่านั้น)
 * ⚠️ บัมพ์ ?v= ของ vendor/fonts/fonts.css ทุกที่ที่อ้างถึง ทุกครั้งที่รันใหม่
 *    (index.html + เอกสารสำหรับพิมพ์: receipt-rc.html, receipt-template.html,
 *     po-print.html, transfer-document.html, document_tranfer.html)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'vendor', 'fonts');

// slug = คำนำหน้าชื่อไฟล์ .woff2 ที่เขียนลงดิสก์
// hasItalic = ตระกูลนั้นมีแกนตัวเอียงจริงไหม (ถ้าไม่มี ต้องใช้ query แบบ wght@ ล้วน
//             ไม่งั้น Google ตอบ 400 Bad Request)
const FAMILIES = [
    { name: 'Sarabun', slug: 'sarabun', subsets: ['thai', 'latin'], hasItalic: true, weights: [400, 500, 600, 700, 800] },
    { name: 'Prompt', slug: 'prompt', subsets: ['thai', 'latin'], hasItalic: true, weights: [400, 500, 600, 700, 800, 900] },
    { name: 'Outfit', slug: 'outfit', subsets: ['latin'], hasItalic: false, weights: [400, 500, 600, 700, 800, 900] }
];

const ITALIC_WEIGHTS = [400]; // ใช้ตัวเอียงแค่น้ำหนักเดียวทั้งระบบ

// ต้องส่ง UA ของเบราว์เซอร์จริง ไม่งั้น Google จะส่ง CSS ที่อ้างฟอนต์ฟอร์แมตเก่า (ttf) กลับมาแทน woff2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const buildCssUrl = (fam) => {
    if (!fam.hasItalic) {
        return `https://fonts.googleapis.com/css2?family=${fam.name}:wght@${fam.weights.join(';')}&display=swap`;
    }
    const spec = [
        ...fam.weights.map(w => `0,${w}`),
        ...ITALIC_WEIGHTS.map(w => `1,${w}`)
    ].join(';');
    return `https://fonts.googleapis.com/css2?family=${fam.name}:ital,wght@${spec}&display=swap`;
};

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

    const blocks = [];
    const written = new Set();
    let total = 0, kept = 0, served = 0;

    for (const fam of FAMILIES) {
        const css = await fetch(buildCssUrl(fam));
        const faces = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)];
        if (!faces.length) throw new Error(`อ่าน @font-face ของ ${fam.name} ไม่ได้ — รูปแบบ CSS อาจเปลี่ยน`);
        served += faces.length;

        const famBlocks = [];
        for (const [, subset, body] of faces) {
            if (!fam.subsets.includes(subset)) continue;

            const url = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
            const weight = body.match(/font-weight:\s*(\d+)/)?.[1];
            const style = body.match(/font-style:\s*(\w+)/)?.[1] || 'normal';
            const range = body.match(/unicode-range:\s*([^;]+);/)?.[1];
            if (!url || !weight || !range) throw new Error(`แยกข้อมูล @font-face ไม่ได้ (${fam.name} / ${subset})`);

            const file = `${fam.slug}-${subset}-${weight}${style === 'italic' ? 'i' : ''}.woff2`;
            const buf = await fetch(url, true);
            fs.writeFileSync(path.join(outDir, file), buf);
            written.add(file);
            total += buf.length;
            kept++;

            famBlocks.push(
                `/* ${subset} */\n@font-face {\n  font-family: '${fam.name}';\n  font-style: ${style};\n` +
                `  font-weight: ${weight};\n  font-display: swap;\n  src: url(${file}) format('woff2');\n` +
                `  unicode-range: ${range.trim()};\n}`
            );
        }

        if (!famBlocks.length) throw new Error(`${fam.name}: ไม่ได้ไฟล์สักตัว — ตรวจ subsets ที่ตั้งไว้`);
        blocks.push(`/* ==================== ${fam.name} ==================== */\n\n` + famBlocks.join('\n\n'));
        console.log(`${fam.name}: เก็บ ${famBlocks.length} ไฟล์`);
    }

    const famSummary = FAMILIES
        .map(f => `${f.name} (${f.weights.join(',')}${f.hasItalic ? ` + italic ${ITALIC_WEIGHTS.join(',')}` : ''} | ${f.subsets.join(', ')})`)
        .join('\n              ');
    const header = `/* สร้างอัตโนมัติโดย tools/build-fonts.js — อย่าแก้ไฟล์นี้โดยตรง\n` +
        `   ตระกูล: ${famSummary}\n` +
        `   แก้แล้วรัน: npm run build:fonts */\n\n`;
    fs.writeFileSync(path.join(outDir, 'fonts.css'), header + blocks.join('\n\n') + '\n');

    console.log(`\nดาวน์โหลดรวม ${kept} ไฟล์ (จาก ${served} ที่ Google เสิร์ฟ) รวม ${(total / 1024).toFixed(1)} KB`);
    console.log(`เขียน vendor/fonts/fonts.css แล้ว`);

    // ตรวจว่าไฟล์ที่ CSS อ้างถึงมีอยู่จริงครบ
    const finalCss = fs.readFileSync(path.join(outDir, 'fonts.css'), 'utf8');
    const missing = [...finalCss.matchAll(/url\(([^)]+\.woff2)\)/g)]
        .map(m => m[1])
        .filter(f => !fs.existsSync(path.join(outDir, f)));
    if (missing.length) {
        console.error('❌ CSS อ้างถึงไฟล์ที่ไม่มีอยู่:', missing.join(', '));
        process.exit(1);
    }
    console.log('✅ ไฟล์ฟอนต์ที่ CSS อ้างถึง มีครบทุกไฟล์');

    // เก็บกวาดไฟล์ .woff2 ที่ตกค้างจากการตั้งค่ารอบก่อน (เช่นน้ำหนักที่เพิ่งตัดออก)
    const stale = fs.readdirSync(outDir)
        .filter(f => f.endsWith('.woff2') && !written.has(f));
    stale.forEach(f => fs.unlinkSync(path.join(outDir, f)));
    if (stale.length) console.log(`🧹 ลบไฟล์ตกค้าง ${stale.length} ไฟล์: ${stale.join(', ')}`);
})().catch(err => { console.error(err); process.exit(1); });
