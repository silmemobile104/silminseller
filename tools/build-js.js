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

    // ตรวจว่าทุก model มีคำอธิบายใน utils/dbCatalogue.js
    // หน้า "จัดการฐานข้อมูล" อ่านจากไฟล์นั้น ถ้าเพิ่ม collection ใหม่แล้วลืมเขียนคำอธิบาย
    // หน้าจะแสดงไม่ครบโดยไม่มีอะไรฟ้อง จึงดักไว้ตรงนี้
    const mongoose = require('mongoose');
    const dbModels = require(path.join(root, 'models'));
    const { catalogue } = require(path.join(root, 'utils/dbCatalogue'));
    const declaredModels = Object.keys(dbModels)
        .filter(k => dbModels[k] && dbModels[k].prototype instanceof mongoose.Model);
    const documented = new Set(catalogue.map(c => c.model));
    const undocumented = declaredModels.filter(m => !documented.has(m));
    const stale = catalogue.map(c => c.model).filter(m => !declaredModels.includes(m));
    const wrongKey = catalogue
        .filter(c => dbModels[c.model] && dbModels[c.model].collection.name !== c.key)
        .map(c => `${c.model} (แคตตาล็อกเขียน '${c.key}' แต่จริงคือ '${dbModels[c.model].collection.name}')`);

    if (undocumented.length || stale.length || wrongKey.length) {
        if (undocumented.length) console.error('\n❌ model เหล่านี้ยังไม่มีคำอธิบายใน utils/dbCatalogue.js:', undocumented.join(', '));
        if (stale.length) console.error('\n❌ แคตตาล็อกอ้างถึง model ที่ไม่มีแล้ว:', stale.join(', '));
        if (wrongKey.length) console.error('\n❌ ชื่อ collection ในแคตตาล็อกไม่ตรงของจริง:', wrongKey.join(', '));
        process.exit(1);
    }
    console.log(`✅ แคตตาล็อกฐานข้อมูลครบ ${catalogue.length} collection`);

    // ตรวจว่าทุกคีย์สิทธิ์ใน permKeys มีสวิตช์ในโมดัลแก้ไขบทบาท
    // ตอนบันทึก page-roles.js เขียน permissions[key] = el ? el.checked : false
    // และ PUT /roles เขียนทับ permissions ทั้งก้อน ดังนั้นคีย์ที่ไม่มีสวิตช์
    // จะถูกตั้งเป็น false เงียบๆ ทุกครั้งที่มีคนกดบันทึกบทบาท — ไม่ใช่แค่มองไม่เห็น
    const rolesSrc = fs.readFileSync(path.join(root, 'js/page-roles.js'), 'utf8');
    const keysMatch = rolesSrc.match(/const permKeys = \[([\s\S]*?)\];/);
    if (!keysMatch) {
        console.error('\n❌ หา permKeys ใน js/page-roles.js ไม่เจอ');
        process.exit(1);
    }
    const permKeys = [...keysMatch[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const noToggle = permKeys.filter(k => !indexSrc.includes(`id="perm-${k}"`));
    if (noToggle.length) {
        console.error('\n❌ คีย์สิทธิ์เหล่านี้ไม่มีสวิตช์ในโมดัลแก้ไขบทบาท (index.html) จะถูกตั้งเป็น false ทุกครั้งที่บันทึกบทบาท:', noToggle.join(', '));
        process.exit(1);
    }
    console.log(`✅ สิทธิ์ทั้ง ${permKeys.length} ข้อมีสวิตช์ในโมดัลแก้ไขบทบาทครบ`);

    // ตรวจว่าทุก view ที่ switchView เปิดได้ อยู่ในอาเรย์ที่ใช้ซ่อนหน้าอื่นด้วย
    // switchView ซ่อนทุกหน้าจากรายชื่อคงที่ก่อน แล้วค่อยเปิดหน้าที่ต้องการ
    // ถ้า view ใหม่ไม่อยู่ในรายชื่อนั้น มันจะไม่ถูกซ่อนตอนสลับไปหน้าอื่น = ค้างอยู่ทุกหน้า
    const scriptSrc = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const hideListMatch = scriptSrc.match(/const views = \[([\s\S]*?)\];/);
    if (!hideListMatch) {
        console.error('\n❌ หาอาเรย์ views ที่ใช้ซ่อนหน้าใน script.js ไม่เจอ');
        process.exit(1);
    }
    const hidden = new Set([...hideListMatch[1].matchAll(/\bview[A-Z]\w*/g)].map(m => m[0]));
    const activated = new Set([...scriptSrc.matchAll(/activateView\(\s*(view[A-Z]\w*)/g)].map(m => m[1]));
    const neverHidden = [...activated].filter(v => !hidden.has(v));
    if (neverHidden.length) {
        console.error('\n❌ view เหล่านี้ถูกเปิดด้วย activateView แต่ไม่อยู่ในอาเรย์ที่ใช้ซ่อน จะค้างอยู่ทุกหน้า:', neverHidden.join(', '));
        process.exit(1);
    }
    console.log(`✅ view ทั้ง ${activated.size} หน้าถูกซ่อนตอนสลับหน้าครบ`);

    // ตรวจว่าทุก view ที่ switchView เปิดได้ อยู่ใน VALID_VIEW_NAMES ด้วย
    // getViewFromHash() คืน null ให้ชื่อที่ไม่อยู่ในเซ็ตนี้ ผลคือกด refresh ค้างหน้านั้นแล้ว
    // ระบบเด้งกลับหน้าเริ่มต้นเงียบๆ — เห็นเป็น "หน้าหาย" ไม่ใช่ error (เกิดมาแล้วกับ #database)
    const validMatch = scriptSrc.match(/const VALID_VIEW_NAMES = new Set\(\[([\s\S]*?)\]\)/);
    const permMapMatches = [...scriptSrc.matchAll(/const viewPermissionMap = \{([\s\S]*?)\n        \};/g)];
    if (!validMatch || !permMapMatches.length) {
        console.error('\n❌ หา VALID_VIEW_NAMES หรือ viewPermissionMap ใน script.js ไม่เจอ');
        process.exit(1);
    }
    const validNames = new Set([...validMatch[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1]));
    const routedNames = new Set(permMapMatches.flatMap(m =>
        [...m[1].matchAll(/'([a-z-]+)':/g)].map(x => x[1])));
    const notRestorable = [...routedNames].filter(v => !validNames.has(v));
    if (notRestorable.length) {
        console.error('\n❌ view เหล่านี้ไม่อยู่ใน VALID_VIEW_NAMES กด refresh ค้างหน้านั้นแล้วจะเด้งกลับหน้าเริ่มต้น:', notRestorable.join(', '));
        process.exit(1);
    }
    console.log(`✅ view ทั้ง ${validNames.size} หน้าคืนสถานะจาก URL hash ได้ครบ`);

    // ตรวจว่าไม่มีใครเขียนสีฝังตรงๆ กลับเข้ามาอีก
    // Tailwind v4 คอมไพล์ bg-[#27272A] เป็น #27272a ตายตัว (ไม่ใช่ var()) สีพวกนี้จึงเปลี่ยนตามธีมไม่ได้
    // เขียนเข้ามาหน้าเดียวก็พอให้โหมดสว่างพังเป็นหย่อมๆ โดยไม่มี error ให้เห็น
    const THEME_BANNED = {
        "#4D4D4D": "bg-panel / bg-chip / border-line-strong",
        "#3F3F46": "border-line / bg-line",
        "#27272A": "bg-field",
        "#18181B": "bg-elevated  (ยกเว้น text-[#18181B] ของปุ่มรองพื้นสว่าง)",
        "#5C5C5C": "bg-skeleton",
        "#464646": "bg-divider / divide-divider",
        "#FFE169": "bg-primary (พื้น) หรือ text-/border-/ring-accent-ink (หมึกและเส้น)",
        "#333333": "text-on-primary / border-hairline",
        "#20D500": "text-state-ok / bg-state-ok",
        "#FE0000": "text-state-danger / bg-state-danger",
        "#FF9F0A": "text-state-pending"
    };
    // hex 3 หลักก็เปลี่ยนตามธีมไม่ได้เหมือนกัน (bg-[#333] คอมไพล์เป็น #333 ตายตัว)
    const THEME_BANNED_SHORT = /[a-z-]+-\[#[0-9a-fA-F]{3}\]/g;
    const THEME_FILES = ["index.html", "script.js", "style.css",
        ...fs.readdirSync(path.join(root, "views")).filter(f => f.endsWith(".html")).map(f => "views/" + f),
        ...fs.readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f)];

    const themeOffenders = [];
    THEME_FILES.forEach((rel) => {
        const src = fs.readFileSync(path.join(root, rel), "utf8");
        const shortHits = src.match(THEME_BANNED_SHORT) || [];
        if (shortHits.length) themeOffenders.push(`${rel}: ${shortHits.length} จุด ${shortHits[0]} -> ใช้โทเคน`);
        Object.entries(THEME_BANNED).forEach(([hex, replacement]) => {
            // text-[#18181B] เป็นตัวอักษรเข้มบนปุ่มรองพื้นสว่าง (ข้อ 11.11) ซึ่งสว่างทั้งสองธีม
            const re = new RegExp("[a-z-]+-\\[" + hex + "\\]", "gi");
            const hits = (src.match(re) || []).filter((h) => !/^text-\[#18181B\]$/i.test(h));
            if (hits.length) themeOffenders.push(`${rel}: ${hits.length} จุด ${hits[0]} -> ใช้ ${replacement}`);
        });
    });
    if (themeOffenders.length) {
        console.error("\n❌ มีสีฝังตรงๆ ที่เปลี่ยนตามธีมไม่ได้ กลับเข้ามาในโค้ด:");
        themeOffenders.slice(0, 15).forEach((o) => console.error("   " + o));
        process.exit(1);
    }
    console.log(`✅ ไม่มีสีฝังตรงๆ ที่เปลี่ยนตามธีมไม่ได้ (ตรวจ ${THEME_FILES.length} ไฟล์)`);
})().catch(err => { console.error(err); process.exit(1); });
