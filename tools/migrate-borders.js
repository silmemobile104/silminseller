// migrate-borders.js — เปลี่ยนกล่องจาก "นิยามด้วยเส้นขอบ" เป็น "นิยามด้วยเงา" (ใช้ครั้งเดียว)
//
// เส้นขอบ 1px รอบกล่องทุกใบทำงานได้ดีบนพื้นดำ แต่บนพื้นสว่างมันให้ความรู้สึกเป็นตาราง
// ไม่ใช่ของที่ลอยอยู่ ตัวเลือกที่ตรงกับโหมดสว่างมากกว่าคือใช้ระดับความลอย (elevation)
//
// ของ 3 อย่างที่ "ไม่แปลง" เพราะเงาแทนไม่ได้จริง ๆ:
//   1. border-t/b/l/r  — เส้นคั่นภายในกล่อง (หัวโมดัล, แถวสรุป) เงาไม่ให้เส้นคั่นแนวนอน
//   2. divide-*        — เส้นคั่นแถวตาราง ถ้าเอาออกตารางอ่านไม่ออก
//   3. border-dashed   — ช่องอัปโหลด เส้นประสื่อ "ลากไฟล์มาวางตรงนี้" เงาสื่อแทนไม่ได้
//
// ส่วน focus/hover ที่เดิมเปลี่ยนสีขอบ ถูกแปลงเป็น ring ซึ่ง Tailwind สร้างด้วย box-shadow
// จึงยังเป็น "เงา" ตามที่ต้องการ และไม่ทำให้ตัวชี้ตำแหน่งโฟกัสหายไป (WCAG 2.4.7)
//
//   node tools/migrate-borders.js --dry-run
//   node tools/migrate-borders.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

// สีขอบที่เป็นแค่ "เส้นรอบกล่อง" — ตัดทิ้งแล้วใช้เงาแทน
const NEUTRAL = ['line-strong', 'line', 'hairline', 'divider-soft', 'divider', 'transparent', 'current',
    'ink'];
// สีขอบที่สื่อความหมาย (เลือกอยู่ / สถานะ) — ต้องคงไว้ แต่เปลี่ยนเป็น ring
const MEANINGFUL = ['accent-ink', 'primary-muted', 'primary-focus', 'primary',
    'state-ok', 'state-ok-tint', 'state-danger', 'state-danger-soft', 'state-pending',
    'red-500'];

const pickElevation = (cls) => {
    if (/\bbg-elevated\b/.test(cls) || /\bmodal-content\b/.test(cls)) return 'elev-modal';
    if (/\bbg-field\b/.test(cls)) return 'elev-field';
    if (/\bbg-(chip|surface-chip|line)\b/.test(cls)) return 'elev-chip';
    if (/\bbg-(panel|canvas-elevated|surface-tile-2|surface-tile-3)\b/.test(cls)) return 'elev-card';
    return 'elev-chip'; // ปุ่ม/ป้ายที่มีแต่ขอบไม่มีพื้น — ให้วงแหวนบาง ๆ แทนเส้น
};

const stats = { stripped: 0, ring: 0, focus: 0, elev: 0, skipped: 0 };

function transform(cls) {
    // มีเส้นคั่นแนว หรือเส้นประ = แตะเฉพาะ focus/hover ที่เหลือ
    const hasDirectional = /\bborder-[trblxy](?![\w-])/.test(cls);
    const hasDashed = /\bborder-dashed\b/.test(cls);

    let out = cls;

    // focus:/hover:/focus-within: ที่เปลี่ยนสีขอบ -> ring (Tailwind สร้าง ring ด้วย box-shadow)
    out = out.replace(/\b(focus|focus-within|hover|group-hover|peer-checked):border-([a-z0-9-]+(?:\/[0-9]+)?)\b/g,
        (m, variant, color) => {
            if (color === 'transparent') return `${variant}:ring-transparent`;
            stats.focus++;
            const w = (variant === 'focus' || variant === 'focus-within') ? 2 : 1;
            return `${variant}:ring-${w} ${variant}:ring-${color}`;
        });

    if (hasDirectional || hasDashed) {
        stats.skipped++;
        return out;
    }

    const before = out;

    // ขอบที่สื่อความหมาย -> ring (ยังเห็นว่าอันไหนถูกเลือก/สถานะอะไร แต่เป็นเงาแล้ว)
    MEANINGFUL.forEach((c) => {
        const re = new RegExp(`(^|\\s)border-${c}(\\/[0-9]+)?(?=\\s|$)`, 'g');
        out = out.replace(re, (m, sp, alpha) => { stats.ring++; return `${sp}ring-1 ring-${c}${alpha || ''}`; });
    });

    // ขอบกลาง ๆ -> ตัดทิ้ง
    NEUTRAL.forEach((c) => {
        const re = new RegExp(`(^|\\s)border-${c}(\\/[0-9]+)?(?=\\s|$)`, 'g');
        out = out.replace(re, (m, sp) => { stats.stripped++; return sp === ' ' ? ' ' : ''; });
    });

    // คลาสความหนาของเส้นที่ไม่มีสีเหลือแล้ว
    out = out.replace(/(^|\s)border-[024](?=\s|$)/g, (m, sp) => (sp === ' ' ? ' ' : ''));
    out = out.replace(/(^|\s)border(?=\s|$)/g, (m, sp) => (sp === ' ' ? ' ' : ''));

    if (out !== before) {
        // ใส่ระดับความลอยให้กล่องที่เพิ่งเสียขอบไป (ยกเว้นที่กลายเป็น ring แล้ว)
        const lostBox = /border/.test(before) && !/\bring-1 ring-/.test(out.replace(before, ''));
        if (lostBox && !/\belev-/.test(out)) {
            // elev-* กับ shadow-* ต่างก็เขียน box-shadow ทับกัน ปล่อยไว้ทั้งคู่จะได้ผลลัพธ์ที่เดาไม่ได้
            // ระดับความลอยชุดใหม่แทน shadow-lg เดิมอยู่แล้ว (และปิดข้อขัดแย้งใน DESIGN.md ข้อ 12 ไปด้วย)
            out = out.replace(/(^|\s)shadow-(lg|md|sm|xl|2xl|\[[^\]]*\])(?=\s|$)/g, (m, sp) => (sp === ' ' ? ' ' : ''))
                .replace(/(^|\s)shadow(?=\s|$)/g, (m, sp) => (sp === ' ' ? ' ' : ''));
            out = `${pickElevation(out)} ${out}`.trim();
            stats.elev++;
        }
    }

    return out.replace(/\s{2,}/g, ' ').trim();
}

const TARGETS = ['index.html', 'script.js',
    ...fs.readdirSync(path.join(root, 'views')).filter(f => f.endsWith('.html')).map(f => 'views/' + f),
    ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];

let changedFiles = 0;
TARGETS.forEach((rel) => {
    const p = path.join(root, rel);
    const src = fs.readFileSync(p, 'utf8');
    // แตะเฉพาะค่าใน class="..." เท่านั้น ไม่ยุ่งกับข้อความอื่นในไฟล์
    // แยกตามชนิดเครื่องหมายคำพูด เพื่อให้ class ที่มี ${...} (ซึ่งข้างในมี ' หรือ `) ยังถูกจับ
    let out = src.replace(/class(\s*=\s*)"([^"]*)"/g, (m, eq, cls) =>
        /border/.test(cls) ? `class${eq}"${transform(cls)}"` : m);
    out = out.replace(/class(\s*=\s*)'([^']*)'/g, (m, eq, cls) =>
        /border/.test(cls) ? `class${eq}'${transform(cls)}'` : m);

    // สตริงคลาสที่ประกอบใน JS (el.className = '...', ตัวแปรเก็บคลาส) ไม่ได้อยู่ในรูป class="..."
    // จึงต้องจับเพิ่ม — แต่ต้องมั่นใจว่าเป็นรายการคลาสจริง ไม่ใช่ข้อความอื่นที่บังเอิญมีคำว่า border
    // เกณฑ์: ต้องมี utility ของ Tailwind อย่างน้อย 2 ตระกูลอยู่ในสตริงเดียวกัน
    const looksLikeClassList = (s) => {
        const markers = [/\bp[xytrbl]?-[0-9.]/, /\brounded/, /\bbg-/, /\btext-/, /\bflex\b/,
            /\bgap-/, /\bw-/, /\bh-/, /\bitems-/, /\btransition/];
        return markers.filter((r) => r.test(s)).length >= 2;
    };
    const jsString = (quote) => new RegExp(`(${quote})((?:[^${quote}\\\\\\n]|\\\\.)*border(?:[^${quote}\\\\\\n]|\\\\.)*)\\1`, 'g');
    ["'", '"', '`'].forEach((q) => {
        out = out.replace(jsString(q), (m, quote, body) => {
            if (/<[a-z]/i.test(body) || !looksLikeClassList(body)) return m; // มีแท็ก HTML = จัดการไปแล้วข้างบน
            const t = transform(body);
            return t === body ? m : `${quote}${t}${quote}`;
        });
    });
    if (out !== src) {
        changedFiles++;
        if (!DRY) fs.writeFileSync(p, out);
    }
});

console.log(`${DRY ? '[ทดลอง] ' : ''}แก้ ${changedFiles} ไฟล์`);
console.log(`   ตัดเส้นขอบกลาง ๆ ทิ้ง      ${stats.stripped}`);
console.log(`   ขอบสื่อความหมาย -> ring    ${stats.ring}`);
console.log(`   focus/hover ขอบ -> ring    ${stats.focus}`);
console.log(`   ใส่ระดับความลอยให้กล่อง    ${stats.elev}`);
console.log(`   ข้าม (เส้นคั่น/เส้นประ)     ${stats.skipped}`);
