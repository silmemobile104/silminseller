#!/usr/bin/env node
/**
 * สร้างไฟล์ไอคอนแบบ self-host ที่ตัดเหลือเฉพาะไอคอนที่โปรเจกต์ใช้จริง
 *
 *   npm run build:icons
 *
 * ทำอะไร:
 *   1. สแกน index.html, views/*.html, script.js, js/*.js หาไอคอนที่ใช้จริง
 *   2. ดึง CSS ต้นทางของ Font Awesome + Bootstrap Icons
 *   3. เก็บเฉพาะ rule ของไอคอนที่ใช้ + rule โครงสร้าง (@font-face, .fa, .fas, ขนาด, animation)
 *   4. เขียนออกเป็น vendor/icons/icons.css (อ้างฟอนต์ในเครื่อง ไม่พึ่ง CDN)
 *   5. subset ไฟล์ .woff2 ให้เหลือเฉพาะ glyph ที่ CSS อ้างถึงจริง (305KB -> ~20KB)
 *
 * ⚠️  ต้องรันใหม่ทุกครั้งที่ "เพิ่มไอคอนตัวใหม่ที่ไม่เคยใช้มาก่อน"
 *     ไม่งั้นไอคอนนั้นจะไม่ขึ้น (เพราะไม่ได้ถูกรวมไว้ทั้งใน CSS และในฟอนต์ที่ subset แล้ว)
 *     ต้นฉบับฟอนต์เก็บไว้ที่ vendor/icons/webfonts/_original/ — subset จากไฟล์นั้นเสมอ
 *     จึงรันซ้ำได้ไม่จำกัด โดยไม่ต้องโหลดจาก CDN ใหม่
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const subsetFont = require('subset-font');

const FA_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
const BI_CSS = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css';

// เวอร์ชันสำหรับ cache-busting ไฟล์ฟอนต์
// ⚠️ ต้องตรงกับเลข ?v= ของ <link rel="preload" ... woff2> และ icons.css ใน index.html
//    บัมพ์เลขนี้ทุกครั้งที่ฟอนต์ถูก subset ใหม่ (เช่น เพิ่มไอคอนใหม่) ไม่งั้นเบราว์เซอร์
//    ที่ cache ไว้ 1 ปีจะยังใช้ฟอนต์เก่าที่ไม่มี glyph ตัวใหม่
const FONT_VERSION = '5';

const root = path.resolve(__dirname, '..');

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            if (res.statusCode !== 200) return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
            let d = '';
            res.setEncoding('utf8');
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        }).on('error', reject);
    });
}

function collectUsedIcons() {
    const files = [
        'index.html',
        ...fs.readdirSync(path.join(root, 'views')).map(f => 'views/' + f),
        'script.js',
        ...fs.readdirSync(path.join(root, 'js')).map(f => 'js/' + f),
    ];
    let blob = '';
    for (const f of files) {
        const p = path.join(root, f);
        if (fs.existsSync(p)) blob += fs.readFileSync(p, 'utf8') + '\n';
    }
    return {
        fa: new Set([...blob.matchAll(/\bfa-([a-z0-9-]+)\b/g)].map(m => 'fa-' + m[1])),
        bi: new Set([...blob.matchAll(/\bbi-([a-z0-9-]+)\b/g)].map(m => 'bi-' + m[1])),
    };
}

/**
 * แยก CSS ออกเป็น top-level rule ทีละก้อน โดยนับความลึกของวงเล็บปีกกาเอง
 * (ใช้ regex ไม่ได้ เพราะ @media / @keyframes มีวงเล็บซ้อนข้างใน — regex จะตัดผิดกลางคัน
 *  แล้วได้ CSS ที่วงเล็บไม่สมดุล ทำให้เบราว์เซอร์ parse พังทั้งไฟล์)
 */
function splitTopLevelRules(css) {
    const rules = [];
    let depth = 0, start = 0, inComment = false, inString = null;

    for (let i = 0; i < css.length; i++) {
        const ch = css[i], next = css[i + 1];

        if (inComment) {
            if (ch === '*' && next === '/') { inComment = false; i++; }
            continue;
        }
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === '/' && next === '*') { inComment = true; i++; continue; }
        if (ch === '"' || ch === "'") { inString = ch; continue; }

        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                rules.push(css.slice(start, i + 1).trim());
                start = i + 1;
            }
        }
    }
    return rules.filter(Boolean);
}

function trim(css, used, prefix, { dropFaces = [] } = {}) {
    const rules = [];
    let kept = 0, dropped = 0;
    const iconRe = new RegExp(`\\.(${prefix}-[a-z0-9-]+)::?before`, 'g');

    for (const rule of splitTopLevelRules(css)) {
        const body = rule.replace(/^\s*(\/\*[\s\S]*?\*\/\s*)*/, ''); // ข้ามคอมเมนต์นำหน้า

        if (/^@font-face/.test(body)) {
            if (dropFaces.some(f => rule.includes(f))) { dropped++; continue; }
            rules.push(rule); kept++; continue;
        }
        // at-rule ที่มีวงเล็บซ้อน (@media, @keyframes, @-webkit-keyframes) เก็บไว้ทั้งก้อนเสมอ
        if (/^@/.test(body)) { rules.push(rule); kept++; continue; }

        const selector = rule.slice(0, rule.indexOf('{'));
        const names = [...selector.matchAll(iconRe)].map(x => x[1]);
        if (names.length > 0) {
            if (names.some(n => used.has(n))) { rules.push(rule); kept++; }
            else dropped++;
            continue;
        }
        rules.push(rule); kept++; // structural rule
    }
    return { css: rules.join('\n'), kept, dropped };
}

// เก็บเฉพาะ src ที่เป็น .woff2 (รองรับทุกเบราว์เซอร์สมัยใหม่) เพื่อไม่ให้เบราว์เซอร์
// ไปขอไฟล์ .ttf/.woff ที่เราไม่ได้ดาวน์โหลดมา แล้วกลายเป็น 404
function woff2Only(css) {
    return css.replace(/@font-face\s*\{[^}]*\}/g, block =>
        block.replace(/src:([^;}]*)([;}])/, (whole, list, end) => {
            const kept = list.split(',').map(s => s.trim()).filter(s => /woff2/.test(s));
            return kept.length ? `src:${kept.join(',')}${end}` : whole;
        })
    );
}

// font-display: block = เบราว์เซอร์ซ่อนข้อความไว้ได้นานถึง 3 วินาทีระหว่างรอฟอนต์
// เปลี่ยนเป็น swap เพื่อให้แสดงด้วย fallback ทันทีแล้วค่อยสลับ (ดีต่อ FCP/LCP)
function fontDisplaySwap(css) {
    return css.replace(/font-display\s*:\s*block/g, 'font-display:swap');
}

// ทำให้ URL ฟอนต์ทุกอันอยู่ในรูปแบบเดียวกัน: ./webfonts/<ชื่อไฟล์>?v=<FONT_VERSION>
// จำเป็นเพราะ Bootstrap Icons ติด query hash ของต้นทางมา (?dd6703...) ถ้า URL ใน CSS
// ไม่ตรงกับใน <link rel="preload"> เป๊ะๆ เบราว์เซอร์จะโหลดฟอนต์ซ้ำสองรอบ
function normalizeFontUrls(css) {
    return css.replace(/url\((["']?)\.\/webfonts\/([a-zA-Z0-9._-]+\.woff2)(\?[^"')]*)?\1\)/g,
        (_m, q, file) => `url(${q}./webfonts/${file}?v=${FONT_VERSION}${q})`);
}

(async () => {
    const used = collectUsedIcons();
    const [faSrc, biSrc] = await Promise.all([get(FA_CSS), get(BI_CSS)]);

    // fa-brands ไม่ได้ใช้เลยในโปรเจกต์นี้ (ประหยัดฟอนต์ ~110KB), fa-v4compatibility ก็ไม่ใช้
    const fa = trim(faSrc.replace(/\.\.\/webfonts\//g, './webfonts/'), used.fa, 'fa', {
        dropFaces: ['fa-brands', 'fa-v4compatibility'],
    });
    const bi = trim(biSrc.replace(/\.\/fonts\//g, './webfonts/'), used.bi, 'bi');

    const out = normalizeFontUrls(fontDisplaySwap(woff2Only(
        '/* ไฟล์นี้ถูกสร้างอัตโนมัติ ห้ามแก้ด้วยมือ — สร้างใหม่ด้วย `npm run build:icons` */\n' +
        fa.css + '\n' + bi.css + '\n'
    )));

    const outDir = path.join(root, 'vendor/icons');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'icons.css'), out, 'utf8');

    // ตรวจสอบว่าไอคอนที่ใช้จริงอยู่ครบในไฟล์ผลลัพธ์
    const realFa = new Set([...faSrc.matchAll(/\.(fa-[a-z0-9-]+)::?before/g)].map(m => m[1]));
    const realBi = new Set([...biSrc.matchAll(/\.(bi-[a-z0-9-]+)::?before/g)].map(m => m[1]));
    const missFa = [...used.fa].filter(n => realFa.has(n) && !out.includes('.' + n + ':'));
    const missBi = [...used.bi].filter(n => realBi.has(n) && !out.includes('.' + n + ':'));

    console.log(`Font Awesome    : เก็บ ${fa.kept} / ตัด ${fa.dropped} rule`);
    console.log(`Bootstrap Icons : เก็บ ${bi.kept} / ตัด ${bi.dropped} rule`);
    console.log(`ขนาดผลลัพธ์      : ${out.length} bytes (ต้นทางรวม ${faSrc.length + biSrc.length} bytes)`);

    // วงเล็บต้องสมดุล ไม่งั้นเบราว์เซอร์ parse CSS พังทั้งไฟล์ = ไอคอนหายหมด
    const opens = (out.match(/\{/g) || []).length;
    const closes = (out.match(/\}/g) || []).length;
    if (opens !== closes) {
        console.error(`\n❌ CSS วงเล็บไม่สมดุล: เปิด ${opens} ปิด ${closes} — ไฟล์นี้ใช้ไม่ได้`);
        process.exit(1);
    }
    console.log(`✅ วงเล็บสมดุล (${opens} คู่)`);

    // ต้องมี @font-face และ rule พื้นฐานของทั้งสองชุด ไม่งั้นไอคอนจะไม่ขึ้นแม้จะมี content
    const required = [
        ['Font Awesome @font-face', /@font-face[\s\S]*?Font Awesome 6 Free/],
        ['Bootstrap @font-face', /@font-face[\s\S]*?bootstrap-icons/],
        ['Bootstrap base rule', /\[class\^="bi-"\]::before/],
        ['FA base rule', /\.fa-solid|\.fas/],
    ];
    const missingReq = required.filter(([, re]) => !re.test(out)).map(([n]) => n);
    if (missingReq.length) {
        console.error('\n❌ ขาด rule ที่จำเป็น:', missingReq.join(', '));
        process.exit(1);
    }
    console.log('✅ rule พื้นฐาน + @font-face ครบ');

    if (missFa.length || missBi.length) {
        console.error('\n❌ มีไอคอนที่ใช้อยู่แต่หายไปจากไฟล์ผลลัพธ์:', [...missFa, ...missBi].join(', '));
        process.exit(1);
    }
    console.log('✅ ไอคอนที่ใช้จริงอยู่ครบทุกตัว');

    await subsetFonts(out);
})().catch(err => { console.error(err); process.exit(1); });

/**
 * ตัดไฟล์ฟอนต์ให้เหลือเฉพาะ glyph ที่ CSS ที่สร้างเสร็จแล้วอ้างถึงจริง
 * ต้นฉบับ 305KB (fa-solid 150 + bootstrap 130 + fa-regular 25) ทั้งที่ใช้แค่ ~166 glyph
 * และ .woff2 บีบด้วย gzip ซ้ำไม่ได้ จึงเป็นก้อน byte ที่หนักที่สุดที่เหลืออยู่
 */
async function subsetFonts(css) {
    const fontsDir = path.join(root, 'vendor/icons/webfonts');
    const origDir = path.join(fontsDir, '_original');
    fs.mkdirSync(origDir, { recursive: true });

    // subset จากต้นฉบับเสมอ (ถ้ายังไม่มีสำเนาต้นฉบับ ให้ย้ายไฟล์ปัจจุบันไปเก็บก่อน)
    for (const f of ['fa-solid-900.woff2', 'fa-regular-400.woff2', 'bootstrap-icons.woff2']) {
        const orig = path.join(origDir, f);
        const cur = path.join(fontsDir, f);
        if (!fs.existsSync(orig) && fs.existsSync(cur)) fs.copyFileSync(cur, orig);
    }

    // ดึง codepoint จาก content:"\fxxx" โดยแยกตามชุดฟอนต์:
    //   FA (minified)     -> .fa-xxx:before{content:"\fxxx"}
    //   Bootstrap (ไม่ min) -> .bi-xxx::before { content: "\fxxx"; }
    const faCps = new Set([...css.matchAll(/\.fa-[a-z0-9-]+:before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"/g)].map(m => m[1]));
    const biCps = new Set([...css.matchAll(/\.bi-[a-z0-9-]+::before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"/g)].map(m => m[1]));

    const toText = set => [...set].map(cp => String.fromCodePoint(parseInt(cp, 16))).join('');

    // fa-solid กับ fa-regular ใช้ codepoint ชุดเดียวกัน (ต่างที่น้ำหนัก) จึงส่ง glyph ชุดเดียวกันให้ทั้งคู่
    // subset-font จะเก็บเฉพาะตัวที่มีอยู่จริงในไฟล์นั้นๆ ให้เอง
    const jobs = [
        { file: 'fa-solid-900.woff2', cps: faCps },
        { file: 'fa-regular-400.woff2', cps: faCps },
        { file: 'bootstrap-icons.woff2', cps: biCps },
    ];

    let before = 0, after = 0;
    for (const { file, cps } of jobs) {
        const src = path.join(origDir, file);
        if (!fs.existsSync(src)) { console.warn(`  ข้าม ${file} (ไม่พบต้นฉบับ)`); continue; }
        const buf = fs.readFileSync(src);
        const subset = await subsetFont(buf, toText(cps), { targetFormat: 'woff2' });
        fs.writeFileSync(path.join(fontsDir, file), subset);
        before += buf.length; after += subset.length;
        console.log(`  ${file.padEnd(24)} ${String(buf.length).padStart(7)} -> ${String(subset.length).padStart(6)} bytes`);
    }
    console.log(`ฟอนต์รวม        : ${before} -> ${after} bytes (ลด ${(100 - after / before * 100).toFixed(1)}%)`);

    // ตรวจของจริง: แปลง woff2 -> sfnt แล้วอ่านตาราง cmap ยืนยันว่า glyph ที่ CSS อ้างถึงอยู่ครบ
    // (เช็คแค่ขนาดไฟล์ไม่พอ — ไฟล์อาจมีขนาดปกติแต่ glyph ที่ต้องใช้หายไปได้)
    const faCovered = new Set();
    let biMissing = [];
    for (const { file, cps } of jobs) {
        const p = path.join(fontsDir, file);
        if (!fs.existsSync(p)) continue;
        const have = await cmapOf(p);
        const wanted = [...cps].map(c => parseInt(c, 16));
        if (file.startsWith('fa-')) wanted.filter(c => have.has(c)).forEach(c => faCovered.add(c));
        else biMissing = wanted.filter(c => !have.has(c));
    }
    // FA แบ่ง glyph ระหว่าง solid กับ regular จึงต้องรวม coverage ของสองไฟล์ก่อนตัดสิน
    const faMissing = [...faCps].map(c => parseInt(c, 16)).filter(c => !faCovered.has(c));
    if (faMissing.length || biMissing.length) {
        console.error('\n❌ glyph หายหลัง subset:',
            [...faMissing, ...biMissing].map(c => c.toString(16)).join(' '));
        process.exit(1);
    }
    console.log(`✅ subset ฟอนต์เรียบร้อย — glyph ครบ (FA ${faCovered.size}, BI ${biCps.size})`);
}

/** อ่าน codepoint ทั้งหมดจากตาราง cmap ของไฟล์ฟอนต์ (รองรับ cmap format 4 และ 12) */
async function cmapOf(woff2Path) {
    const fontverter = require('fontverter');
    const buf = await fontverter.convert(fs.readFileSync(woff2Path), 'truetype');
    const u16 = o => buf.readUInt16BE(o), u32 = o => buf.readUInt32BE(o);

    let cmapOff = null;
    const numTables = u16(4);
    for (let i = 0; i < numTables; i++) {
        const rec = 12 + i * 16;
        if (buf.toString('ascii', rec, rec + 4) === 'cmap') { cmapOff = u32(rec + 8); break; }
    }
    if (cmapOff == null) throw new Error(`ไม่พบตาราง cmap ใน ${woff2Path}`);

    const found = new Set();
    const nSub = u16(cmapOff + 2);
    for (let i = 0; i < nSub; i++) {
        const subOff = cmapOff + u32(cmapOff + 4 + i * 8 + 4);
        const format = u16(subOff);
        if (format === 4) {
            const segX2 = u16(subOff + 6);
            const endO = subOff + 14, startO = endO + segX2 + 2;
            for (let s = 0; s < segX2 / 2; s++) {
                const end = u16(endO + s * 2), start = u16(startO + s * 2);
                if (start === 0xffff) continue;
                for (let c = start; c <= end && c !== 0xffff; c++) found.add(c);
            }
        } else if (format === 12) {
            const nGroups = u32(subOff + 12);
            for (let g = 0; g < nGroups; g++) {
                const go = subOff + 16 + g * 12;
                for (let c = u32(go), e = u32(go + 4); c <= e; c++) found.add(c);
            }
        }
    }
    return found;
}
