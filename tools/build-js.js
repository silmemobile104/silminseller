#!/usr/bin/env node
/**
 * Minify JavaScript ลงโฟลเดอร์ dist/ (ซอร์สเดิมไม่ถูกแตะ)
 *
 *   npm run build:js
 *
 * ทำอะไร:
 *   - script.js        -> dist/script.js
 *   - js/page-*.js     -> dist/js/page-*.js
 *   - สร้าง source map (.map) คู่กันทุกไฟล์ เพื่อให้ debug ใน DevTools ได้เหมือนซอร์สเดิม
 *
 * ทำไมถึงปลอดภัย (ตรวจแล้วก่อนเปิดใช้):
 *   - ไม่มี eval() / with() / new Function() ในโปรเจกต์เลย
 *   - js/page-*.js ห่อด้วย IIFE ทุกไฟล์ และ export ออกมาทาง `window.X = ...`
 *     esbuild ไม่เปลี่ยนชื่อ property บน window การเรียกข้ามไฟล์จึงไม่พัง
 *   - ฟังก์ชันที่ถูกเรียกจาก onclick= ใน HTML ทุกตัว export ผ่าน window. เช่นกัน
 *   - ตั้ง keepNames: true กันไว้อีกชั้น เผื่อมีโค้ดที่พึ่ง Function.prototype.name
 *
 * ⚠️ ต้องรันใหม่ทุกครั้งที่แก้ script.js หรือ js/*.js ก่อน deploy
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const outRoot = path.join(root, 'dist');

// ไฟล์ที่ต้อง minify: script.js + ทุกไฟล์ใน js/
const entries = [
    { src: 'script.js', out: 'dist/script.js' },
    ...fs.readdirSync(path.join(root, 'js'))
        .filter(f => f.endsWith('.js'))
        .map(f => ({ src: `js/${f}`, out: `dist/js/${f}` })),
];

(async () => {
    fs.mkdirSync(path.join(outRoot, 'js'), { recursive: true });

    let totalIn = 0, totalOut = 0;
    const rows = [];

    for (const { src, out } of entries) {
        const srcPath = path.join(root, src);
        const outPath = path.join(root, out);
        const code = fs.readFileSync(srcPath, 'utf8');

        const result = await esbuild.transform(code, {
            minify: true,
            // กันพลาด: ไม่ให้ esbuild เปลี่ยนชื่อฟังก์ชัน/คลาส เผื่อมีโค้ดพึ่งชื่อ
            keepNames: true,
            // ไม่ transpile ลง ES เก่า เพื่อให้ผลลัพธ์ใกล้เคียงซอร์สที่ทดสอบมาแล้วที่สุด
            target: 'es2020',
            sourcemap: true,
            sourcefile: path.basename(src),
            legalComments: 'none',
        });

        const mapName = path.basename(out) + '.map';
        fs.writeFileSync(outPath, result.code + `\n//# sourceMappingURL=${mapName}\n`, 'utf8');
        fs.writeFileSync(outPath + '.map', result.map, 'utf8');

        totalIn += code.length;
        totalOut += result.code.length;
        rows.push(`  ${src.padEnd(32)} ${String(code.length).padStart(7)} -> ${String(result.code.length).padStart(7)} bytes`);
    }

    console.log(rows.join('\n'));
    console.log('---');
    console.log(`รวม: ${totalIn} -> ${totalOut} bytes (ลด ${(100 - totalOut / totalIn * 100).toFixed(1)}%)`);

    // ตรวจความถูกต้องเบื้องต้น: ไฟล์ผลลัพธ์ต้อง parse เป็น JS ได้ และต้องไม่ว่าง
    const vm = require('vm');
    let bad = 0;
    for (const { out } of entries) {
        const p = path.join(root, out);
        const c = fs.readFileSync(p, 'utf8');
        if (c.trim().length < 50) { console.error(`❌ ${out} เล็กผิดปกติ`); bad++; continue; }
        try {
            new vm.Script(c, { filename: out });
        } catch (e) {
            console.error(`❌ ${out} parse ไม่ผ่าน: ${e.message}`);
            bad++;
        }
    }
    if (bad) process.exit(1);
    console.log(`✅ ไฟล์ผลลัพธ์ ${entries.length} ไฟล์ parse ผ่านทั้งหมด`);

    // ตรวจว่า global ที่ถูกเรียกข้ามไฟล์/จาก onclick ยังถูก export ครบ
    const distScript = fs.readFileSync(path.join(root, 'dist/script.js'), 'utf8');
    const distJs = fs.readdirSync(path.join(outRoot, 'js'))
        .filter(f => f.endsWith('.js'))
        .map(f => fs.readFileSync(path.join(outRoot, 'js', f), 'utf8')).join('\n');
    const allDist = distScript + '\n' + distJs;

    const mustExport = [
        'authFetch', 'showToast', 'showConfirm', 'allProductsCache', 'masterDataCache',
        'closeAddAccountModal', 'closeAddGroupModal', 'closeAuditVerifyModal',
        'closeAuditReviewItemModal', 'submitModalAuditItem', 'toggleExpectedList',
        'ensureXlsxLoaded',
    ];
    const lost = mustExport.filter(n => !new RegExp(`window\\.${n}\\s*=`).test(allDist));
    if (lost.length) {
        console.error('\n❌ global เหล่านี้หายไปจากไฟล์ที่ minify แล้ว:', lost.join(', '));
        process.exit(1);
    }
    console.log('✅ global ที่เรียกข้ามไฟล์/จาก onclick ถูก export ครบ');
})().catch(err => { console.error(err); process.exit(1); });
