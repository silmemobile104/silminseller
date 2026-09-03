// remove-box-borders.js — เก็บเส้นขอบชุดสุดท้ายที่ยังเป็น "กรอบรอบกล่อง" (ใช้ครั้งเดียว)
//
// เก็บไว้ตามที่สั่ง: เส้นขอบที่เป็น "เส้น" เท่านั้น
//   - border-t/b/l/r และ divide-*  = เส้นคั่นในกล่อง/ระหว่างแถว
//   - border-top ใน inline style ของเอกสารสั่งพิมพ์
//
// เอาออก: ทุกอย่างที่เป็นกรอบล้อมรอบกล่อง
//   1. border-dashed (ช่องอัปโหลด) -> ใช้ระดับความลอยแทน
//   2. inline style="...border:1px solid <สี>..." ของไทล์ไอคอน -> ใช้พื้นจางของสีเดียวกันแทน
//
// ไม่แตะ: เอกสารที่สร้างใน window.open เพื่อสั่งพิมพ์ (js/page-accounting-settings.js)
// เส้นตารางในใบสำคัญที่พิมพ์ลงกระดาษขาวไม่เกี่ยวกับธีมของหน้าจอ ตัดออกแล้วใบเสร็จอ่านไม่รู้เรื่อง

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const TARGETS = ['index.html', 'script.js',
    ...fs.readdirSync(path.join(root, 'views')).filter(f => f.endsWith('.html')).map(f => 'views/' + f),
    ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'))
        // ไฟล์นี้สร้าง HTML สำหรับสั่งพิมพ์ ไม่ใช่ UI บนจอ
        .filter(f => f !== 'page-accounting-settings.js')
        .map(f => 'js/' + f)];

const stats = { dashed: 0, tile: 0, tileBg: 0 };

TARGETS.forEach((rel) => {
    const p = path.join(root, rel);
    let src = fs.readFileSync(p, 'utf8');
    const before = src;

    // ---- 1) กรอบเส้นประของช่องอัปโหลด -> ระดับความลอย ----
    src = src.replace(/class(\s*=\s*)"([^"]*border-dashed[^"]*)"/g, (m, eq, cls) => {
        stats.dashed++;
        let out = cls
            .replace(/(^|\s)border-dashed(?=\s|$)/g, (x, sp) => (sp === ' ' ? ' ' : ''))
            .replace(/(^|\s)border-(2|4)(?=\s|$)/g, (x, sp) => (sp === ' ' ? ' ' : ''))
            .replace(/(^|\s)border-(line|hairline|line-strong|divider|slate-[0-9]+)(?=\s|$)/g, (x, sp) => (sp === ' ' ? ' ' : ''))
            .replace(/(^|\s)border(?=\s|$)/g, (x, sp) => (sp === ' ' ? ' ' : ''));
        if (!/\belev-/.test(out)) out = `elev-chip ${out}`;
        return `class${eq}"${out.replace(/\s{2,}/g, ' ').trim()}"`;
    });

    // ---- 2) ไทล์ไอคอน: ตัดกรอบทิ้ง และเลิกใช้พื้นหลังสีเข้มที่ฝังตายตัว ----
    // #27272A ไม่เปลี่ยนตามธีม โหมดสว่างจะได้วงกลมสีเข้มโดดบนการ์ดขาว
    // ใช้พื้นจาง 12% ของสีไอคอนเองแทน (แพตเทิร์นที่การ์ด KPI ใช้อยู่แล้ว) อ่านออกทั้งสองธีม
    src = src.replace(/style="color:([^;"]+);background-color:([^;"]+);border:1px solid ([^;"]+);?"/g,
        (m, color, bg, borderColor) => {
            stats.tile++;
            const tint = /^#27272A$/i.test(bg.trim()) ? `${color}1F` : bg;
            if (tint !== bg) stats.tileBg++;
            return `style="color:${color};background-color:${tint};"`;
        });

    if (src !== before && !DRY) fs.writeFileSync(p, src);
});

console.log(`${DRY ? '[ทดลอง] ' : ''}กรอบเส้นประ -> ระดับความลอย   ${stats.dashed}`);
console.log(`${DRY ? '' : ''}ไทล์ไอคอน: ตัดกรอบ inline      ${stats.tile}`);
console.log(`${DRY ? '' : ''}   ในนั้นเปลี่ยนพื้นให้ตามธีม   ${stats.tileBg}`);
