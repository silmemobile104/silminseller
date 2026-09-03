// restore-box-metrics.js — คืนความสูง/ความกว้างเดิมหลังเปลี่ยน border เป็นเงา (ใช้ครั้งเดียว)
//
// ปัญหาที่ต้องแก้: box-sizing: border-box มีผลเฉพาะกล่องที่กำหนดขนาดตายตัว
// กล่องส่วนใหญ่ในระบบสูงตามเนื้อหา (px-4 py-2.5) เส้นขอบ 1px บน+ล่างจึงเคยบวกความสูงจริง 2px
// พอ migrate-borders.js ตัดเส้นขอบออก กล่องพวกนั้นเลยเตี้ยลง 2px และแคบลง 2px ทุกใบ
//
// ทางแก้: ใส่เส้นขอบโปร่งใสกลับไปแทนที่ — เรขาคณิตกลับมาเท่าเดิมเป๊ะ แต่ยังมองไม่เห็นเส้น
//   - elev-*   จัดการที่ CSS (border: 1px solid transparent ใน src/tailwind-input.css)
//   - ring-*   ที่ไม่มี elev-* ต้องใส่ในมาร์กอัป (ไฟล์นี้ทำ)
//
// อีกอย่างที่แก้ไปด้วย: กล่องที่ "เดิมขอบเป็น transparent อยู่แล้ว" (จานสี, ชิปที่ขอบโผล่ตอน hover)
// ไม่ควรได้ elev-* เพราะขอบมันตั้งใจให้ล่องหน การใส่วงแหวนทำให้ทุกอันดูเหมือนถูกเลือกอยู่

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const TARGETS = ['index.html', 'script.js',
    ...fs.readdirSync(path.join(root, 'views')).filter(f => f.endsWith('.html')).map(f => 'views/' + f),
    ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];

// ตัวชี้ว่า element นี้เดิมมีขอบโปร่งใส ไม่ใช่กล่องที่ต้องมีเงา
const WAS_TRANSPARENT = [/\bnp-swatch-dot\b/, /\bswatch-indicator\b/, /\bcustom-swatch\b/,
    /\bw-7 h-7 rounded-full\b/];

const stats = { swatch: 0, ring: 0 };

const fix = (cls) => {
    let out = cls;

    // 1) ขอบล่องหนเดิม -> เอา elev-* ออก คืน border-2 border-transparent (เรขาคณิตเดิม + ไม่มีเส้น)
    if (/\belev-(chip|card|field|modal)\b/.test(out) && WAS_TRANSPARENT.some((r) => r.test(out))) {
        out = out.replace(/(^|\s)elev-(chip|card|field|modal)(?=\s|$)/g, (m, sp) => (sp === ' ' ? ' ' : ''));
        if (!/\bborder-transparent\b/.test(out)) {
            out = `border-2 border-transparent ${out}`.trim();
        }
        stats.swatch++;
        return out.replace(/\s{2,}/g, ' ').trim();
    }

    // 2) กล่องที่กลายเป็น ring อย่างเดียว (ไม่มี elev-*) ยังขาด 1px ที่เคยมี
    const hasRing = /\bring-1\b/.test(out);
    const hasElev = /\belev-/.test(out);
    const hasBorderWidth = /\bborder(-[0-9])?(?=\s|$)/.test(out) || /\bborder-[trblxy]\b/.test(out);
    if (hasRing && !hasElev && !hasBorderWidth) {
        out = `border border-transparent ${out}`.trim();
        stats.ring++;
    }

    return out.replace(/\s{2,}/g, ' ').trim();
};

let changed = 0;
TARGETS.forEach((rel) => {
    const p = path.join(root, rel);
    const src = fs.readFileSync(p, 'utf8');
    let out = src.replace(/class(\s*=\s*)"([^"]*)"/g, (m, eq, cls) =>
        (/\belev-|\bring-1\b/.test(cls) ? `class${eq}"${fix(cls)}"` : m));
    out = out.replace(/class(\s*=\s*)'([^']*)'/g, (m, eq, cls) =>
        (/\belev-|\bring-1\b/.test(cls) ? `class${eq}'${fix(cls)}'` : m));
    if (out !== src) { changed++; if (!DRY) fs.writeFileSync(p, out); }
});

console.log(`${DRY ? '[ทดลอง] ' : ''}แก้ ${changed} ไฟล์`);
console.log(`   คืนขอบล่องหนให้จานสี/ชิป (ถอด elev-*)  ${stats.swatch}`);
console.log(`   คืน 1px ให้กล่องที่มีแต่ ring          ${stats.ring}`);
