#!/usr/bin/env node
/**
 * ย่อรูปที่โหลดตอนเปิดเว็บให้พอดีกับขนาดที่แสดงจริง
 *
 *   npm run build:images
 *
 * ทำไมต้องมี:
 *   รูปคือ ~85% ของน้ำหนักหน้าแรก และ gzip ช่วยไม่ได้ (รูปบีบมาแล้ว) ต่างจากโค้ดที่ gzip
 *   ลดให้เยอะแล้ว ต้นฉบับหลายไฟล์ใหญ่กว่าขนาดที่แสดงจริงหลายสิบเท่า เช่น
 *   icon_silminmobile.png เป็น 2827x1158 (599KB) แต่แสดงแค่กว้าง 200px
 *
 * หลักการตั้งขนาด: กว้าง = 2 เท่าของขนาดที่แสดงจริงใน HTML (เผื่อจอ retina)
 *   คงอัตราส่วนเดิมเสมอ ผลลัพธ์บนหน้าจอจึงเหมือนเดิมเป๊ะ เบราว์เซอร์ย่อ/ยืดแบบเดียวกับก่อนหน้า
 *
 * ⚠️ อย่าแก้ไฟล์ปลายทางโดยตรง — มันถูกเขียนทับทุกครั้งที่รันคำสั่งนี้
 *    ต้นฉบับความละเอียดสูงอยู่ที่ _original/ (แนวเดียวกับ vendor/icons/webfonts/_original/)
 *    ถ้าจะเปลี่ยนโลโก้ ให้วางไฟล์ใหม่ใน _original/ แล้วรันใหม่
 *
 * ⚠️ เปลี่ยนรูปแล้วต้องบัมพ์ ?v= ของรูปนั้นใน index.html ด้วย ไม่งั้น Service Worker
 *    กับ HTTP cache (maxAge 1 ปี) จะยังเสิร์ฟรูปเก่าให้ผู้ใช้
 *
 * หมายเหตุเรื่องรูปแบบไฟล์: อย่าใช้ .ico กับ <img> — ICO เก็บบิตแมปแบบไม่บีบอัด
 *   ไอคอน 128x128 จึงกลายเป็น 66KB (128*128*4 ไบต์พอดี) ขณะที่ PNG ขนาดเดียวกันเหลือ ~1KB
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = (f) => path.join(root, '_original', f);
const out = (f) => path.join(root, f);

// [ไฟล์ต้นฉบับ, ไฟล์ปลายทาง, ความกว้างเป้าหมาย, ขนาดที่แสดงจริงใน HTML (ไว้อ้างอิง)]
const TARGETS = [
    ['icon_silminmobile.png', 'icon_silminmobile.png', 400, 'หน้า login กว้าง 200'],
    ['logo_silminmobile.png', 'logo_silminmobile.png', 240, 'sidebar กว้าง 120'],
    ['logo.png', 'logo.png', 64, 'favicon'],
    // menu.png ถูกแทนด้วย SVG inline ใน index.html แล้ว (ดู #icon-hamburger)
    // PNG สีขาวมองไม่เห็นบนพื้นสว่าง ส่วน SVG ใช้ currentColor จึงตามธีมได้เอง
    // bell.png ถูกแทนด้วย SVG inline ใน index.html แล้ว (ดู #icon-bell)
    // PNG สีเดียวตายตัวย้อมตามธีมไม่ได้ ส่วน SVG ใช้ currentColor จึงตามธีมได้เอง
    ['logout-4.png', 'icons_img/logout-4.png', 40, 'ปุ่มออกจากระบบ กว้าง 19'],
];

(async () => {
    let totalIn = 0, totalOut = 0;
    const rows = [];

    for (const [from, to, width, note] of TARGETS) {
        const srcPath = src(from);
        if (!fs.existsSync(srcPath)) {
            console.error(`❌ ไม่พบต้นฉบับ: _original/${from}`);
            process.exit(1);
        }
        const before = fs.statSync(srcPath).size;

        fs.mkdirSync(path.dirname(out(to)), { recursive: true });
        await sharp(srcPath)
            .resize({ width, withoutEnlargement: true })  // คงอัตราส่วน ไม่ขยายถ้าต้นฉบับเล็กกว่า
            .png({ compressionLevel: 9, palette: true })   // palette: ลดเป็น 8-bit ถ้าสีไม่เกิน 256 สี
            .toFile(out(to));

        const after = fs.statSync(out(to)).size;
        totalIn += before;
        totalOut += after;
        rows.push(
            `  ${to.padEnd(30)} ${(before / 1024).toFixed(1).padStart(7)} KB -> ${(after / 1024).toFixed(1).padStart(6)} KB   (${note})`
        );
    }

    console.log(rows.join('\n'));
    console.log('---');
    console.log(`รวม: ${(totalIn / 1024).toFixed(1)} KB -> ${(totalOut / 1024).toFixed(1)} KB (ลด ${(100 - totalOut / totalIn * 100).toFixed(1)}%)`);

    // ตรวจว่าไฟล์ผลลัพธ์เปิดเป็นรูปได้จริงและมีขนาดตามที่ตั้งไว้
    let bad = 0;
    for (const [, to, width] of TARGETS) {
        try {
            const m = await sharp(out(to)).metadata();
            if (m.width > width) { console.error(`❌ ${to} กว้าง ${m.width}px เกินเป้า ${width}px`); bad++; }
        } catch (e) {
            console.error(`❌ ${to} เปิดเป็นรูปไม่ได้: ${e.message}`);
            bad++;
        }
    }
    if (bad) process.exit(1);
    console.log(`✅ ไฟล์ผลลัพธ์ ${TARGETS.length} ไฟล์ ถูกต้องทั้งหมด`);
})().catch(err => { console.error(err); process.exit(1); });
