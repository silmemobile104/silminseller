// migrate-colors.js — ย้ายสีที่เขียน hex/คลาสสีตรง ๆ ไปเป็นโทเคนความหมาย (ใช้ครั้งเดียว)
//
// ทำไมต้องมี: Tailwind v4 คอมไพล์ utility ของโทเคนเป็น var() แต่คอมไพล์ค่าเฉพาะกิจ
// bg-[#18181B] เป็น #18181b ตายตัว — สีที่ฝังตรง ๆ จึงเปลี่ยนตามธีมไม่ได้เลย
// นี่คือเหตุผลเดียวที่ light mode ต้องรอการย้ายชุดนี้ก่อน (และปิดหนี้ DESIGN.md ข้อ 12 ไปในตัว)
//
// ความปลอดภัย: โทเคนเกือบทุกตัวตั้งค่าโหมดมืดให้ "เท่ากับ hex ที่มันแทน" เป๊ะ ๆ
// สคริปต์พิสูจน์เงื่อนไขนี้กับ src/tailwind-input.css จริงก่อนเขียนไฟล์ ถ้าไม่ตรงจะหยุดทันที
// มีข้อยกเว้นที่ตั้งใจ 4 รายการ (ดู INTENTIONAL_SHIFTS) ซึ่งขยับเข้าหาค่าที่ DESIGN.md ข้อ 1-10 กำหนด
//
//   node tools/migrate-colors.js --dry-run   ดูว่าจะเปลี่ยนอะไรบ้างโดยไม่เขียนไฟล์
//   node tools/migrate-colors.js             เขียนจริง

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// ตารางแมป — เรียงจาก "เจาะจงที่สุด" ไป "กว้างที่สุด" เสมอ
// เพราะ bg-[#4D4D4D] เป็นสตริงย่อยของ bg-[#4D4D4D]/40 ถ้าสลับลำดับจะแทนที่ผิด
// ---------------------------------------------------------------------------
const MAP = [
    // ---- พื้นผิว ----
    ['bg-[#4D4D4D]/40', 'bg-panel/40'],
    ['bg-[#4D4D4D]/60', 'bg-chip/60'],
    ['bg-[#4D4D4D]', 'bg-panel'],
    ['border-[#4D4D4D]/50', 'border-line-strong/50'],
    ['border-[#4D4D4D]', 'border-line-strong'],

    ['border-[#3F3F46]', 'border-line'],
    ['divide-[#3F3F46]', 'divide-line'],
    ['bg-[#3F3F46]', 'bg-line'],

    ['bg-[#27272A]', 'bg-field'],

    ['via-[#18181B]/90', 'via-elevated/90'],
    ['from-[#18181B]', 'from-elevated'],
    ['bg-[#18181B]', 'bg-elevated'],

    ['bg-[#5c5c5c]/50', 'bg-skeleton/50'],
    ['bg-[#5c5c5c]', 'bg-skeleton'],
    ['bg-[#5C5C5C]', 'bg-skeleton'],

    ['divide-[#464646]', 'divide-divider'],
    ['border-[#464646]', 'border-divider'],
    ['bg-[#464646]', 'bg-divider'],

    // ---- accent: พื้นคงเหลือง / หมึกกับเส้นแยกไปอีกโทเคน ----
    ['bg-[#FFE169]/[0.12]', 'bg-primary/[0.12]'],
    ['bg-[#FFE169]/20', 'bg-primary/20'],
    ['bg-[#FFE169]', 'bg-primary'],
    ['border-[#FFE169]/50', 'border-accent-ink/50'],
    ['border-[#FFE169]', 'border-accent-ink'],
    ['text-[#FFE169]/70', 'text-accent-ink/70'],
    ['text-[#FFE169]', 'text-accent-ink'],
    ['ring-[#FFE169]', 'ring-accent-ink'],
    ['accent-[#FFE169]', 'accent-accent-ink'],
    ['shadow-[#FFE169]/10', 'shadow-accent-ink/10'],

    // ---- ตัวอักษรบนพื้นเหลือง (ขยับเข้าหาค่าในเอกสาร) ----
    ['text-[#333333]', 'text-on-primary'],
    ['text-black', 'text-on-primary'],
    ['border-[#333333]', 'border-hairline'],
    ['bg-[#333333]/20', 'bg-hairline/20'],
    ['bg-[#333333]', 'bg-hairline'],

    // ---- สีบอกสถานะ (ได้เป็นโทเคนตามข้อเสนอ DESIGN.md ข้อ 12.1) ----
    ['text-[#20D500]', 'text-state-ok'],
    ['bg-[#20D500]', 'bg-state-ok'],
    ['border-[#20D500]/20', 'border-state-ok/20'],
    ['bg-[#42A231]/[0.12]', 'bg-state-ok-tint/[0.12]'],
    ['border-[#42A231]/30', 'border-state-ok-tint/30'],

    ['text-[#FE0000]', 'text-state-danger'],
    ['bg-[#FE0000]/[0.12]', 'bg-state-danger/[0.12]'],
    ['bg-[#FE0000]/30', 'bg-state-danger/30'],
    ['bg-[#FE0000]/20', 'bg-state-danger/20'],
    ['bg-[#FE0000]', 'bg-state-danger'],
    ['border-[#FE0000]/40', 'border-state-danger/40'],
    ['border-[#FE0000]/30', 'border-state-danger/30'],
    ['border-[#FE0000]/20', 'border-state-danger/20'],
    ['text-[#FF6B6B]', 'text-state-danger-soft'],

    ['text-[#FF9F0A]', 'text-state-pending'],
    ['bg-[#FF9F0A]/[0.12]', 'bg-state-pending/[0.12]'],
    ['bg-[#FF9F0A]/20', 'bg-state-pending/20'],
    ['border-[#FF9F0A]/40', 'border-state-pending/40'],

    // ---- ตัวอักษร: คลาสสีของ Tailwind ที่หลุดพาเลตต์ (DESIGN.md ข้อ 12 "ไม่มี slate ในพาเลตต์") ----
    ['text-white/90', 'text-ink/90'],
    ['text-white/80', 'text-ink/80'],
    ['text-white/70', 'text-ink/70'],
    ['text-white/60', 'text-ink/60'],
    ['text-white/50', 'text-ink/50'],
    ['text-white/40', 'text-ink/40'],
    ['text-white/30', 'text-ink/30'],
    ['text-white', 'text-ink'],

    ['text-slate-100', 'text-ink'],
    ['text-slate-200', 'text-ink'],
    ['text-slate-300', 'text-body-muted'],
    ['text-slate-400', 'text-body-muted'],
    ['text-gray-300', 'text-body-muted'],
    ['text-gray-400', 'text-body-muted'],

    ['placeholder-slate-500', 'placeholder-ink-muted-48'],
    ['placeholder-gray-500', 'placeholder-ink-muted-48'],
    ['placeholder-white', 'placeholder-body-muted'],

    // ---- ขอบ/พื้นที่เป็น overlay โปร่ง — ต้องกลับด้านตามธีม ----
    ['border-white/30', 'border-ink/30'],
    ['border-white/20', 'border-ink/20'],
    ['border-white/10', 'border-ink/10'],
    ['border-white', 'border-ink'],
    ['bg-white/60', 'bg-ink/60'],
    ['bg-white/40', 'bg-ink/40'],
    ['bg-white/30', 'bg-ink/30'],
    ['bg-white/20', 'bg-ink/20'],
    ['bg-white/10', 'bg-ink/10'],
    ['bg-white/5', 'bg-ink/5'],

    ['border-slate-700', 'border-line'],
    ['border-slate-600', 'border-line'],
    ['bg-slate-900/50', 'bg-elevated/50'],
    ['bg-slate-900/30', 'bg-elevated/30'],
    ['bg-slate-900', 'bg-elevated'],
    ['bg-slate-700/50', 'bg-field/50'],
    ['bg-slate-700', 'bg-field'],
    ['bg-slate-600', 'bg-chip'],
    // ---- ส่วนหางที่เหลือหลังรอบแรก ----
    // #E2B93C (เหลืองตอนชี้) และคู่ #E4E4E7/#18181B (ปุ่มรองพื้นสว่าง ข้อ 11.11)
    // จงใจไม่แตะ — เป็นสีที่ใช้ได้ทั้งสองธีมอยู่แล้ว
    ["bg-[#2a2a2a]", "bg-surface-chip"],
    ["bg-[#1a1a1a]", "bg-surface-tile-3"],
    ["bg-[#1f1f1f]", "bg-surface-tile-3"],
    ["bg-[#222222]", "bg-surface-tile-2"],
    ["text-[#C9C9C9]", "text-body-muted"],
    ["text-[#313131]", "text-on-primary"],
    ["border-[#b48025]", "border-accent-ink"],
    ["bg-[#258e1c]", "bg-state-ok"],

    ["bg-black/70", "bg-canvas/70"],
    ["bg-black", "bg-canvas"],
    ["ring-white/25", "ring-ink/25"],
    ["bg-slate-800", "bg-field"],
    ["divide-slate-800", "divide-line"],
    ["text-slate-900", "text-ink"],
    ["text-slate-600", "text-body-muted"],
    ["text-slate-500", "text-ink-muted-48"],
    // ---- เศษที่เหลือรอบสุดท้าย (ของหลุดมือ/พิมพ์ผิดจากธีมเก่า) ----
    ["bg-[#1c1c1c]", "bg-surface-tile-3"],
    ["bg-[#141416]", "bg-surface-tile-3"],
    ["bg-[#117200]", "bg-state-ok"],
    ["bg-[#008A27]", "bg-state-ok"],
    ["bg-[#007020]", "bg-state-ok"],
    ["text-slate-505", "text-body-muted"],   // คลาสนี้พิมพ์ผิดมาแต่เดิม ไม่เคยมีผลอะไร
    ["ring-white/20", "ring-ink/20"],
    ["placeholder-slate-700", "placeholder-ink-muted-48"],
    ["border-slate-800", "border-line"],
    ["border-gray-700", "border-line"],
    ["border-gray-300", "border-hairline"],
    ["bg-slate-950/60", "bg-canvas/60"],
    ["bg-slate-400", "bg-body-muted"],
];

// โทเคน -> hex ที่มันแทนในโหมดมืด ต้องตรงกันเป๊ะ ไม่งั้นโหมดมืดเปลี่ยนโดยไม่ตั้งใจ
const EXPECT_DARK = {
    'panel': '#4D4D4D', 'chip': '#4D4D4D', 'line-strong': '#4D4D4D',
    'line': '#3F3F46', 'field': '#27272A', 'elevated': '#18181B',
    'skeleton': '#5C5C5C', 'divider': '#464646',
    'primary': '#FFE169', 'accent-ink': '#FFE169',
    'state-ok': '#20D500', 'state-ok-tint': '#42A231',
    'state-danger': '#FE0000', 'state-danger-soft': '#FF6B6B',
    'state-pending': '#FF9F0A'
};

// ข้อยกเว้นที่ตั้งใจ — ขยับเข้าหาค่าที่ DESIGN.md ข้อ 1-10 กำหนดไว้ ทุกคู่ยังผ่าน AAA
const INTENTIONAL_SHIFTS = [
    ['text-white / text-slate-100/200', '#ffffff', '#f5f5f7 (--color-ink)', 'ข้อ 12: "อย่าใช้ขาวสนิท"'],
    ['text-[#333333] / text-black', '#333333', '#1d1d1f (--color-on-primary)', 'ข้อ 12: ตัวอักษรบนปุ่มเหลือง'],
    ['border-[#333333]', '#333333', '#38383a (--color-hairline)', 'ยุบเข้าโทเคน hairline'],
    ['text-slate-300/400, text-gray-300/400', 'slate/gray', '#a1a1a6 (--color-body-muted)', 'ข้อ 12: ไม่มี slate ในพาเลตต์']
];

// ไฟล์ที่ห้ามแตะ: Backup/ (ของเก่า), dist/ (ผลลัพธ์ build), vendor/, node_modules/
const TARGETS = [
    'index.html', 'script.js',
    ...fs.readdirSync(path.join(root, 'views')).filter(f => f.endsWith('.html')).map(f => 'views/' + f),
    ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
];

// ---------------------------------------------------------------------------
// พิสูจน์ก่อนเขียน: ค่าโหมดมืดของทุกโทเคนต้องเท่ากับ hex เดิม
// ---------------------------------------------------------------------------
function assertDarkParity() {
    const css = fs.readFileSync(path.join(root, 'src/tailwind-input.css'), 'utf8');
    const themeBlock = css.slice(css.indexOf('@theme'), css.indexOf('/* ====', css.indexOf('@theme')));
    const bad = [];
    Object.entries(EXPECT_DARK).forEach(([token, hex]) => {
        const m = themeBlock.match(new RegExp('--color-' + token.replace(/[-]/g, '\\-') + ':\\s*([^;]+);'));
        if (!m) return bad.push(`--color-${token} ไม่มีใน @theme`);
        if (m[1].trim().toUpperCase() !== hex.toUpperCase()) {
            bad.push(`--color-${token} = ${m[1].trim()} แต่ต้องเป็น ${hex}`);
        }
    });
    if (bad.length) {
        console.error('\n❌ ค่าโหมดมืดไม่ตรงกับ hex ที่จะถูกแทนที่ — หยุดก่อนที่โหมดมืดจะเพี้ยน:');
        bad.forEach(b => console.error('   ' + b));
        process.exit(1);
    }
    console.log(`✅ ค่าโหมดมืดของโทเคนทั้ง ${Object.keys(EXPECT_DARK).length} ตัวตรงกับ hex เดิมทุกตัว`);
}

// ---------------------------------------------------------------------------
function run() {
    assertDarkParity();

    // กันตัวเองพลาด: ฝั่งขวาของแมปห้ามมีค่าที่ฝั่งซ้ายจะไปแทนที่ซ้ำ
    const seen = new Set();
    MAP.forEach(([from]) => {
        if (seen.has(from)) { console.error(`❌ แมปซ้ำ: ${from}`); process.exit(1); }
        seen.add(from);
    });

    let grand = 0;
    const perFile = [];

    TARGETS.forEach(rel => {
        const p = path.join(root, rel);
        let src = fs.readFileSync(p, 'utf8');
        const before = src;
        let n = 0;

        MAP.forEach(([from, to]) => {
            if (!src.includes(from)) return;
            const parts = src.split(from);
            n += parts.length - 1;
            src = parts.join(to);
        });

        if (src !== before) {
            perFile.push({ rel, n });
            grand += n;
            if (!DRY) fs.writeFileSync(p, src);
        }
    });

    perFile.sort((a, b) => b.n - a.n);
    console.log(`\n${DRY ? '[ทดลอง] ' : ''}แทนที่ ${grand} จุด ใน ${perFile.length} ไฟล์`);
    perFile.slice(0, 12).forEach(f => console.log(`   ${String(f.n).padStart(5)}  ${f.rel}`));
    if (perFile.length > 12) console.log(`   ... อีก ${perFile.length - 12} ไฟล์`);

    console.log('\nข้อยกเว้นที่ตั้งใจให้สีขยับ (โหมดมืด):');
    INTENTIONAL_SHIFTS.forEach(([what, from, to, why]) =>
        console.log(`   ${what}\n      ${from} -> ${to}   (${why})`));
}

run();
