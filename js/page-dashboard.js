// Dashboard (แดชบอร์ดผู้บริหาร)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "แดชบอร์ด" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, API_BASE_URL, window.switchView (global จาก script.js)
//
// ⚠️ กฎเหล็กของหน้านี้: ทุกตัวเลขบนจอต้องมาจาก /api/dashboard-stats ซึ่งคำนวณจากฐานข้อมูลจริง
//    ห้ามใส่ตัวเลขตัวอย่าง/ค่าประมาณลงไปเด็ดขาด ช่องไหนไม่มีข้อมูลต้นทางให้แสดงสถานะว่างแทน
//    (เช่น "เป้าหมายยอดขายรายสาขา" ที่ระบบยังไม่มีที่เก็บ จึงไม่มีคอลัมน์นั้นในตารางเลย)
//
// กราฟทั้งหมดวาดด้วย SVG เองในไฟล์นี้ ไม่ได้พึ่งไลบรารีภายนอก — คงหลักการของโปรเจกต์
// ที่ว่าหน้าเว็บไม่โหลด origin ภายนอกเลย (ดู CLAUDE.md หัวข้อ Assets)
(function () {
    // ==========================================
    // ตัวช่วยจัดรูปแบบ
    // ==========================================
    const nf = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const baht = (n) => `฿${nf.format(Math.round(n || 0))}`;
    const num = (n) => nf.format(Math.round(n || 0));

    // ย่อหลักเงินสำหรับแกน Y ของกราฟ (2,500,000 -> 2.5M)
    const compact = (n) => {
        const v = Math.abs(n);
        if (v >= 1e6) return `${(n / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
        if (v >= 1e3) return `${(n / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1)}K`;
        return String(Math.round(n));
    };

    // ข้อมูลจากฐานข้อมูล (ชื่อสินค้า/ซัพพลายเออร์/สาขา) ถูกยัดเข้า innerHTML
    // จึงต้อง escape ก่อนเสมอ กัน HTML แปลกปลอมที่หลุดมากับชื่อทำหน้าพัง
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const THAI_MONTHS = ['ม.ค', 'ก.พ', 'มี.ค', 'เม.ย', 'พ.ค', 'มิ.ย', 'ก.ค', 'ส.ค', 'ก.ย', 'ต.ค', 'พ.ย', 'ธ.ค'];
    const dateTH = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

    // สีของสองชุดข้อมูลที่ใช้ร่วมกันทั้งกราฟเส้นและโดนัท (โทนเดียวกับ DESIGN.md ข้อ 11.6)
    // เขียว 1.99:1 และเหลือง 1.29:1 บนการ์ดขาว = มองไม่เห็น ต้องอ่านโทเคนตอนวาด
    let C_DEVICE = '#20D500';   // ยอดขายเฉพาะเครื่อง
    let C_ACCESSORY = '#FFE169'; // ยอดขายอุปกรณ์เสริม
    let C_UNKNOWN = '#8E8E93';   // สินค้าที่ถูกลบไปแล้ว จัดหมวดไม่ได้
    let C_LOSS = '#FE0000';
    const refreshChartColors = () => {
        C_DEVICE = themeColor('state-ok', '#20D500');
        C_ACCESSORY = themeColor('accent-ink', '#FFE169');
        C_UNKNOWN = themeColor('ink-muted-48', '#8E8E93');
        C_LOSS = themeColor('state-danger', '#FE0000');
    };

    // SVG ใส่ค่าสีลงไปตอนสร้างสตริง ไม่ใช่ผ่านคลาส CSS จึงตามธีมเองไม่ได้
    // ต้องอ่านโทเคนจาก :root ตอนวาดทุกครั้ง (ดู listener 'themechange' ท้ายไฟล์)
    const themeColor = (name, fallback) => {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--color-' + name).trim();
        return v || fallback;
    };

    let _data = null;          // ข้อมูลชุดล่าสุดจาก API — ใช้วาดกราฟใหม่ตอนเปลี่ยนขนาดจอ
    let _resizeBound = false;

    // ==========================================
    // [2] การ์ดตัวเลขหลัก
    // ==========================================
    // changePct = null หมายถึงช่วงก่อนหน้าเป็นศูนย์ คำนวณเปอร์เซ็นต์ไม่ได้
    // กรณีนั้นไม่แสดงบรรทัดเปรียบเทียบเลย ดีกว่าโชว์ 0% หรือ ∞ ที่ไม่เป็นความจริง
    const deltaLine = (changePct, label) => {
        if (changePct === null || changePct === undefined || !isFinite(changePct)) {
            return `<p class="text-xs text-ink/50 mt-1">ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ</p>`;
        }
        const up = changePct >= 0;
        const color = up ? 'text-state-ok' : 'text-state-danger';
        const icon = up ? 'fa-arrow-up' : 'fa-arrow-down';
        return `<p class="text-xs ${color} mt-1 flex items-center gap-1">
            <i class="fa-solid ${icon} text-[10px]"></i>${Math.abs(changePct).toFixed(1)}%
            <span class="text-ink/50">${esc(label)}</span>
        </p>`;
    };

    const kpiCard = (icon, color, label, value, extraHtml) => `
        <div class="bg-panel/40 rounded-2xl shadow-lg backdrop-blur-sm p-5 flex items-start gap-4">
            <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                 style="color:${color};background-color:${color}1F;">
                <i class="fa-solid ${icon} text-lg"></i>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-xs text-ink/70 truncate">${esc(label)}</p>
                <p class="text-2xl font-semibold text-ink font-mono mt-0.5 truncate">${value}</p>
                ${extraHtml}
            </div>
        </div>`;

    function renderKpis(d) {
        const grid = document.getElementById('dash-kpi-grid');
        if (!grid) return;
        const k = d.kpi;
        const cmp = d.period.comparisonLabel;
        const asOf = new Date(d.period.generatedAt)
            .toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        grid.innerHTML = [
            kpiCard('fa-baht-sign', '#FFE169', 'ยอดขายรวม', baht(k.sales.value), deltaLine(k.sales.changePct, cmp)),
            kpiCard('fa-chart-line', '#20D500', 'กำไรขั้นต้น', baht(k.grossProfit.value), deltaLine(k.grossProfit.changePct, cmp)),
            kpiCard('fa-bag-shopping', '#0A84FF', 'ออเดอร์', num(k.orders.value), deltaLine(k.orders.changePct, cmp)),
            kpiCard('fa-user-plus', '#A855F7', 'ลูกค้าใหม่', num(k.newMembers.value), deltaLine(k.newMembers.changePct, cmp)),
            kpiCard('fa-boxes-stacked', '#FF9F0A', 'สินค้าคงคลังรวม', num(k.stockQty),
                `<p class="text-xs text-ink/50 mt-1">ชิ้น รวมทุกสาขาที่ดูได้</p>`),
            kpiCard('fa-database', '#22D3EE', 'มูลค่าสต็อก (ราคาทุน)', baht(k.stockValue),
                `<p class="text-xs text-ink/50 mt-1">อัพเดตล่าสุด ${asOf} น.</p>`)
        ].join('');
    }

    // ==========================================
    // [3] กราฟยอดขายรายปี (SVG วาดเอง)
    // ==========================================
    // เส้นโค้งแบบ monotone cubic (Fritsch–Carlson)
    // ⚠️ ห้ามใช้ Catmull-Rom ธรรมดากับกราฟนี้ — เดือนที่ยอดพุ่งขึ้นเดือนเดียวจะทำให้เส้นแกว่ง
    //    เลยจุดจริงจนตกลงไปใต้เส้นศูนย์ กลายเป็นภาพว่า "ยอดขายติดลบ" ทั้งที่ข้อมูลเป็น 0
    //    วิธีนี้การันตีว่าเส้นจะไม่เกินช่วงค่าของจุดข้างเคียงเลย
    const smoothPath = (pts) => {
        const n = pts.length;
        if (!n) return '';
        if (n < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');

        const dx = [], dy = [], delta = [];
        for (let i = 0; i < n - 1; i++) {
            dx[i] = pts[i + 1].x - pts[i].x;
            dy[i] = pts[i + 1].y - pts[i].y;
            delta[i] = dy[i] / dx[i];
        }

        const m = [delta[0]];
        for (let i = 1; i < n - 1; i++) {
            // ถ้าความชันสองข้างคนละทิศ แปลว่าจุดนี้เป็นยอด/ก้นกราฟ ต้องบังคับความชันเป็น 0
            m[i] = (delta[i - 1] * delta[i] <= 0) ? 0 : (delta[i - 1] + delta[i]) / 2;
        }
        m[n - 1] = delta[n - 2];

        for (let i = 0; i < n - 1; i++) {
            if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            const a = m[i] / delta[i], b = m[i + 1] / delta[i];
            const s = a * a + b * b;
            if (s > 9) {
                const tau = 3 / Math.sqrt(s);
                m[i] = tau * a * delta[i];
                m[i + 1] = tau * b * delta[i];
            }
        }

        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < n - 1; i++) {
            const c1x = pts[i].x + dx[i] / 3, c1y = pts[i].y + (m[i] * dx[i]) / 3;
            const c2x = pts[i + 1].x - dx[i] / 3, c2y = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
            d += ` C${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1].x},${pts[i + 1].y}`;
        }
        return d;
    };

    // ปัดเพดานแกน Y ขึ้นเป็นเลขกลมๆ เพื่อให้เส้นกริดอ่านง่าย (เช่น 168,179 -> 200,000)
    const niceMax = (v) => {
        if (v <= 0) return 1000;
        const mag = Math.pow(10, Math.floor(Math.log10(v)));
        const n = v / mag;
        const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
        return step * mag;
    };

    function renderSalesChart(d) {
        const host = document.getElementById('dash-sales-chart');
        if (!host) return;

        const months = d.monthlySales || [];
        const maxVal = Math.max(...months.map(m => Math.max(m.device, m.accessory)), 0);

        if (maxVal <= 0) {
            host.innerHTML = `<div class="py-16 text-center text-ink/50 italic">
                ยังไม่มียอดขายในปีนี้</div>`;
            return;
        }

        // อ่านสีจากธีมปัจจุบันทุกครั้งที่วาด — สลับธีมแล้วกราฟต้องเปลี่ยนตาม
        refreshChartColors();
        const INK = themeColor('ink', '#FFFFFF');
        const CANVAS = themeColor('canvas-elevated', '#1F1F1F');

        const W = Math.max(host.clientWidth || 560, 320);
        const H = 280;
        const PAD = { top: 12, right: 12, bottom: 28, left: 52 };
        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;

        const top = niceMax(maxVal);
        const GRID = 5; // เส้นกริด 5 ช่อง = 6 ระดับ รวมเส้นศูนย์
        const x = (i) => PAD.left + (plotW * i) / 11;
        const y = (v) => PAD.top + plotH - (plotH * v) / top;

        const devicePts = months.map((m, i) => ({ x: x(i), y: y(m.device) }));
        const accPts = months.map((m, i) => ({ x: x(i), y: y(m.accessory) }));
        const areaOf = (pts) =>
            `${smoothPath(pts)} L${pts[pts.length - 1].x},${PAD.top + plotH} L${pts[0].x},${PAD.top + plotH} Z`;

        let grid = '', yLabels = '';
        for (let i = 0; i <= GRID; i++) {
            const val = (top * i) / GRID;
            const gy = y(val);
            grid += `<line x1="${PAD.left}" y1="${gy}" x2="${W - PAD.right}" y2="${gy}"
                        stroke="${INK}" stroke-opacity="0.08" stroke-width="1" />`;
            yLabels += `<text x="${PAD.left - 10}" y="${gy + 4}" text-anchor="end"
                        fill="${INK}" fill-opacity="0.5" font-size="11">${compact(val)}</text>`;
        }

        const xLabels = months.map((m, i) =>
            `<text x="${x(i)}" y="${H - 8}" text-anchor="middle"
                   fill="${INK}" fill-opacity="0.5" font-size="11">${THAI_MONTHS[i]}</text>`).join('');

        const dots = (pts, color) => pts.map((p, i) =>
            months[i].device || months[i].accessory
                ? `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}" stroke="${CANVAS}" stroke-width="1.5" />`
                : '').join('');

        // แถบโปร่งใสรายเดือนไว้รับเมาส์ สำหรับ tooltip
        const bandW = plotW / 11;
        const bands = months.map((m, i) =>
            `<rect class="dash-band" data-i="${i}" x="${x(i) - bandW / 2}" y="${PAD.top}"
                   width="${bandW}" height="${plotH}" fill="transparent" style="cursor:crosshair" />`).join('');

        host.innerHTML = `
            <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
                 aria-label="กราฟยอดขายรายเดือนของปีนี้ แยกตามยอดขายเฉพาะเครื่องและอุปกรณ์เสริม">
                <defs>
                    <linearGradient id="dashGradDevice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${C_DEVICE}" stop-opacity="0.35" />
                        <stop offset="100%" stop-color="${C_DEVICE}" stop-opacity="0" />
                    </linearGradient>
                    <linearGradient id="dashGradAcc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${C_ACCESSORY}" stop-opacity="0.35" />
                        <stop offset="100%" stop-color="${C_ACCESSORY}" stop-opacity="0" />
                    </linearGradient>
                </defs>
                ${grid}${yLabels}${xLabels}
                <path d="${areaOf(accPts)}" fill="url(#dashGradAcc)" />
                <path d="${areaOf(devicePts)}" fill="url(#dashGradDevice)" />
                <path d="${smoothPath(accPts)}" fill="none" stroke="${C_ACCESSORY}" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round" />
                <path d="${smoothPath(devicePts)}" fill="none" stroke="${C_DEVICE}" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round" />
                ${dots(accPts, C_ACCESSORY)}${dots(devicePts, C_DEVICE)}
                <line id="dash-hoverline" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + plotH}"
                      stroke="${INK}" stroke-opacity="0.25" stroke-width="1" style="display:none" />
                ${bands}
            </svg>
            <div id="dash-tooltip"
                 class="elev-modal pointer-events-none absolute hidden z-10 rounded-xl bg-elevated px-3 py-2.5 text-xs whitespace-nowrap"></div>`;

        // ---- tooltip ----
        const svg = host.querySelector('svg');
        const tip = host.querySelector('#dash-tooltip');
        const hoverLine = host.querySelector('#dash-hoverline');
        const year = new Date(d.period.end).getFullYear() + 543;

        host.querySelectorAll('.dash-band').forEach(band => {
            band.addEventListener('mouseenter', () => {
                const i = Number(band.dataset.i);
                const m = months[i];
                const total = m.device + m.accessory + m.unknown;
                tip.innerHTML = `
                    <p class="text-ink font-medium mb-1.5">${THAI_MONTHS[i]} ${year}</p>
                    <p class="flex items-center gap-2 text-ink/80">
                        <span class="w-2 h-2 rounded-full shrink-0" style="background:${C_DEVICE}"></span>
                        เฉพาะเครื่อง <span class="ml-auto font-mono text-ink">${baht(m.device)}</span></p>
                    <p class="flex items-center gap-2 text-ink/80 mt-1">
                        <span class="w-2 h-2 rounded-full shrink-0" style="background:${C_ACCESSORY}"></span>
                        อุปกรณ์เสริม <span class="ml-auto font-mono text-ink">${baht(m.accessory)}</span></p>
                    ${m.unknown ? `<p class="flex items-center gap-2 text-ink/80 mt-1">
                        <span class="w-2 h-2 rounded-full shrink-0" style="background:${C_UNKNOWN}"></span>
                        ไม่ระบุหมวด <span class="ml-auto font-mono text-ink">${baht(m.unknown)}</span></p>` : ''}
                    <p class="mt-1.5 pt-1.5 border-t border-hairline text-ink/70">
                        รวม <span class="font-mono text-ink ml-1">${baht(total)}</span></p>`;
                tip.classList.remove('hidden');

                const px = x(i);
                hoverLine.setAttribute('x1', px);
                hoverLine.setAttribute('x2', px);
                hoverLine.style.display = '';

                // กันกล่องล้นขอบการ์ดด้านขวา
                const tw = tip.offsetWidth || 190;
                tip.style.left = `${Math.max(0, Math.min(px - tw / 2, W - tw))}px`;
                tip.style.top = `${PAD.top + 8}px`;
            });
        });
        svg.addEventListener('mouseleave', () => {
            tip.classList.add('hidden');
            hoverLine.style.display = 'none';
        });
    }

    // ==========================================
    // [4a] โดนัทสัดส่วนหมวดหมู่
    // ==========================================
    function renderCategory(d) {
        refreshChartColors();
        const host = document.getElementById('dash-category-body');
        if (!host) return;
        const mix = d.categoryMix;

        if (!mix.total) {
            host.innerHTML = `<p class="py-12 text-center text-ink/50 italic">ยังไม่มียอดขายในช่วงนี้</p>`;
            return;
        }

        const slices = [
            { label: 'ยอดขายเฉพาะเครื่อง', value: mix.device, color: C_DEVICE },
            { label: 'ยอดขายอุปกรณ์เสริม', value: mix.accessory, color: C_ACCESSORY },
            { label: 'ไม่ระบุหมวดหมู่', value: mix.unknown, color: C_UNKNOWN }
        ].filter(s => s.value > 0);

        const R = 58, SW = 20, C = 2 * Math.PI * R;
        let offset = 0;
        const arcs = slices.map(s => {
            const len = (s.value / mix.total) * C;
            const seg = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${s.color}"
                stroke-width="${SW}" stroke-dasharray="${len} ${C - len}"
                stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" stroke-linecap="butt" />`;
            offset += len;
            return seg;
        }).join('');

        host.innerHTML = `
            <div class="flex flex-col items-center gap-5">
                <div class="relative shrink-0">
                    <svg width="160" height="160" viewBox="0 0 160 160" role="img"
                         aria-label="สัดส่วนยอดขายแยกตามหมวดหมู่สินค้า">
                        <circle cx="80" cy="80" r="${R}" fill="none" stroke="${themeColor('ink', '#FFFFFF')}"
                                stroke-opacity="0.08" stroke-width="${SW}" />
                        ${arcs}
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span class="text-[11px] text-ink/70">ยอดขายรวม</span>
                        <span class="text-base font-semibold text-ink font-mono">${num(mix.total)}</span>
                    </div>
                </div>
                <div class="w-full space-y-3">
                    ${slices.map(s => `
                        <div class="flex items-start gap-2.5">
                            <span class="w-3 h-3 rounded-full shrink-0 mt-1" style="background:${s.color}"></span>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-ink">${esc(s.label)}</p>
                                <p class="text-xs text-ink/70 font-mono">
                                    ${((s.value / mix.total) * 100).toFixed(1)}% · ${baht(s.value)}</p>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`;
    }

    // ==========================================
    // [4b] รายรับ - รายจ่าย
    // ==========================================
    function renderCashflow(d) {
        refreshChartColors();
        const host = document.getElementById('dash-cashflow-body');
        if (!host) return;
        const cf = d.cashflow;
        const hasData = cf.income.total > 0 || cf.expense.total > 0;

        if (!hasData) {
            host.innerHTML = `<p class="py-12 text-center text-ink/50 italic">
                ยังไม่มีการบันทึกรายรับรายจ่ายในช่วงนี้</p>`;
            return;
        }

        // แถบสัดส่วนเทียบกับด้านที่มากกว่า เพื่อให้เห็นว่ารายรับ/รายจ่ายฝั่งไหนหนักกว่า
        const scale = Math.max(cf.income.total, cf.expense.total) || 1;
        const panel = (title, total, breakdown, color, barPct) => `
            <div class="elev-field bg-field rounded-xl p-4 flex flex-col">
                <p class="text-xs font-medium" style="color:${color}">${esc(title)}</p>
                <p class="text-2xl font-semibold font-mono mt-1" style="color:${color}">${baht(total)}</p>
                <div class="mt-3 space-y-1 flex-1">
                    ${breakdown.length
                ? breakdown.map(b => `<p class="flex items-center gap-2 text-[11px] text-ink/70">
                            <span class="truncate">${esc(b.label)}</span>
                            <span class="ml-auto font-mono text-ink shrink-0">${baht(b.amount)}</span></p>`).join('')
                : `<p class="text-[11px] text-ink/50 italic">ไม่มีรายการย่อย</p>`}
                </div>
                <div class="mt-3 h-1.5 rounded-full bg-ink/10 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${barPct}%;background:${color}"></div>
                </div>
            </div>`;

        const net = cf.netProfit;
        const marginPct = cf.income.total ? (net / cf.income.total) * 100 : null;
        const netColor = net >= 0 ? themeColor('state-ok', '#20D500') : C_LOSS;

        host.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                ${panel('รายรับ', cf.income.total, cf.income.breakdown, C_DEVICE,
            (cf.income.total / scale) * 100)}
                ${panel('รายจ่าย', cf.expense.total, cf.expense.breakdown, C_LOSS,
                (cf.expense.total / scale) * 100)}
                <div class="elev-field bg-field rounded-xl p-4 flex flex-col justify-center items-center text-center">
                    <p class="text-xs text-ink/70">กำไรสุทธิ</p>
                    <p class="text-2xl font-semibold font-mono mt-1" style="color:${netColor}">${baht(net)}</p>
                    ${marginPct === null ? '' : `
                        <p class="text-xs text-ink/70 mt-3">อัตรากำไร</p>
                        <p class="text-sm font-semibold font-mono flex items-center gap-1"
                           style="color:${netColor}">
                            <i class="fa-solid ${net >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} text-[10px]"></i>
                            ${Math.abs(marginPct).toFixed(1)}%
                        </p>`}
                </div>
            </div>
            <p class="text-[11px] text-ink/50 mt-3">
                คิดจากรายการเงินสดที่บันทึกไว้ในระบบบัญชี (CashMovement) ตามช่วงเวลาที่เลือก
            </p>`;
    }

    // ==========================================
    // [3b] ตารางรายสาขา · [4c] สินค้าขายดี · [5] ใบสั่งซื้อ
    // ==========================================
    const stateRow = (cols, msg) =>
        `<tr><td colspan="${cols}" class="px-6 py-8 text-center text-ink/50 italic">${esc(msg)}</td></tr>`;

    function renderBranchTable(d) {
        const tbody = document.getElementById('dash-branch-tbody');
        if (!tbody) return;
        const rows = d.branchPerformance || [];
        if (!rows.length) { tbody.innerHTML = stateRow(4, 'ยังไม่มียอดขายในช่วงเวลาที่เลือก'); return; }

        tbody.innerHTML = rows.map(r => `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-3.5 text-ink font-medium">${esc(r.branch)}</td>
                <td class="px-6 py-3.5 text-right text-ink font-mono">${baht(r.sales)}</td>
                <td class="px-6 py-3.5 text-right font-mono ${r.profit >= 0 ? 'text-state-ok' : 'text-state-danger'}">${baht(r.profit)}</td>
                <td class="px-6 py-3.5 text-center text-ink font-medium">${num(r.orders)}</td>
            </tr>`).join('');
    }

    function renderTopProducts(d) {
        const tbody = document.getElementById('dash-top-tbody');
        if (!tbody) return;
        const rows = d.topProducts || [];
        if (!rows.length) { tbody.innerHTML = stateRow(4, 'ยังไม่มีสินค้าที่ขายได้ในช่วงนี้'); return; }

        tbody.innerHTML = rows.map((r, i) => `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-3.5 text-ink/70">${i + 1}</td>
                <td class="px-6 py-3.5 text-ink font-medium">${esc(r.name)}</td>
                <td class="px-6 py-3.5 text-center text-ink font-medium">${num(r.qty)}</td>
                <td class="px-6 py-3.5 text-right text-ink font-mono">${baht(r.amount)}</td>
            </tr>`).join('');
    }

    // สีป้ายสถานะ PO — ใช้โทน ok/fail/working ตาม DESIGN.md ข้อ 11.6
    const PO_TONE = {
        'รอจัดส่ง': { bg: 'bg-orange-500/[0.12]', dot: 'bg-orange-500', text: 'text-orange-400' },
        'ของถึงสาขาแล้ว': { bg: 'bg-orange-500/[0.12]', dot: 'bg-orange-500', text: 'text-orange-400' },
        'กำลังตรวจรับ': { bg: 'bg-orange-500/[0.12]', dot: 'bg-orange-500', text: 'text-orange-400' },
        'นำเข้าสำเร็จ': { bg: 'bg-state-ok-tint/[0.12]', dot: 'bg-state-ok', text: 'text-state-ok' },
        'ยกเลิก': { bg: 'bg-state-danger/[0.12]', dot: 'bg-state-danger', text: 'text-state-danger' }
    };

    function renderPurchaseOrders(d) {
        const tbody = document.getElementById('dash-po-tbody');
        if (!tbody) return;
        const rows = d.recentPurchaseOrders || [];
        if (!rows.length) { tbody.innerHTML = stateRow(5, 'ยังไม่มีใบสั่งซื้อในระบบ'); return; }

        tbody.innerHTML = rows.map(r => {
            const t = PO_TONE[r.status] || { bg: 'bg-panel/40', dot: 'bg-ink/40', text: 'text-ink/70' };
            return `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${esc(r.po_number)}</span></td>
                <td class="px-6 py-4 text-ink font-medium">${esc(r.supplier_name)}</td>
                <td class="px-6 py-4 text-right text-ink font-mono">${baht(r.amount)}</td>
                <td class="px-6 py-4">
                    <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">
                        <div class="w-2 h-2 rounded-full ${t.dot}"></div>
                        <span class="${t.text} font-medium text-xs">${esc(r.status)}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-ink text-sm">${dateTH(r.created_at)}</td>
            </tr>`;
        }).join('');
    }

    // ==========================================
    // แถวโครงร่างระหว่างรอข้อมูล (DESIGN.md ข้อ 11.7)
    // ==========================================
    const skelBar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;

    function renderSkeletons() {
        const grid = document.getElementById('dash-kpi-grid');
        if (grid && !grid.children.length) {
            grid.innerHTML = Array.from({ length: 6 }).map(() => `
                <div class="bg-panel/40 rounded-2xl shadow-lg backdrop-blur-sm p-5 flex items-start gap-4">
                    <div class="w-11 h-11 rounded-full bg-skeleton animate-pulse shrink-0"></div>
                    <div class="flex-1 space-y-2">
                        ${skelBar('w-20')}${skelBar('w-28 h-5')}${skelBar('w-24 h-3')}
                    </div>
                </div>`).join('');
        }
        const tables = [
            ['dash-branch-tbody', 4], ['dash-top-tbody', 4], ['dash-po-tbody', 5]
        ];
        tables.forEach(([id, cols]) => {
            const tb = document.getElementById(id);
            if (tb && !tb.children.length) {
                tb.innerHTML = Array.from({ length: 4 }).map(() =>
                    `<tr>${Array.from({ length: cols }).map(() =>
                        `<td class="px-6 py-3.5">${skelBar('w-full')}</td>`).join('')}</tr>`).join('');
            }
        });
    }

    // โหลดไม่สำเร็จ — ต้องล้างแถวโครงร่างทิ้งแล้วบอกสาเหตุ
    // ไม่งั้นโครงร่างจะกระพริบค้างอยู่อย่างนั้นราวกับว่ายังโหลดไม่เสร็จ
    function renderErrorState(message) {
        _data = null;
        const msg = esc(message);
        const grid = document.getElementById('dash-kpi-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="col-span-full bg-state-danger/[0.12] rounded-2xl px-5 py-4 flex items-center gap-3">
                    <i class="fa-solid fa-triangle-exclamation text-state-danger"></i>
                    <p class="text-sm text-state-danger font-medium">${msg}</p>
                </div>`;
        }
        [['dash-branch-tbody', 4], ['dash-top-tbody', 4], ['dash-po-tbody', 5]]
            .forEach(([id, cols]) => {
                const tb = document.getElementById(id);
                if (tb) tb.innerHTML = `<tr><td colspan="${cols}"
                    class="px-6 py-8 text-center text-ink/50 italic">${msg}</td></tr>`;
            });
        [['dash-sales-chart', 'py-16'], ['dash-category-body', 'py-12'], ['dash-cashflow-body', 'py-12']]
            .forEach(([id, pad]) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<p class="${pad} text-center text-ink/50 italic">${msg}</p>`;
            });
    }

    // ==========================================
    // โหลดข้อมูล + ตัวกรอง
    // ==========================================
    const todayISO = () => {
        const d = new Date();
        // toISOString แปลงเป็น UTC ก่อน ซึ่งทำให้วันที่เพี้ยนไปหนึ่งวันในโซนเวลาไทย (UTC+7)
        // จึงประกอบสตริงเองจากเวลาท้องถิ่นแทน
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    function currentQuery() {
        const p = new URLSearchParams();
        const status = document.getElementById('dash-filter-status')?.value || '';
        const branch = document.getElementById('dash-filter-branch')?.value || '';
        const start = document.getElementById('dash-filter-start')?.value || '';
        const end = document.getElementById('dash-filter-end')?.value || '';
        if (status) p.set('status', status);
        if (branch) p.set('branch_id', branch);
        if (start) p.set('start', start);
        if (end) p.set('end', end || start);
        return p.toString();
    }

    async function loadDashboardData() {
        renderSkeletons();
        try {
            const qs = currentQuery();
            const response = await authFetch(`${API_BASE_URL}/dashboard-stats${qs ? '?' + qs : ''}`);
            const json = await response.json();
            if (!json.success) {
                console.error('ดึงข้อมูลแดชบอร์ดไม่สำเร็จ:', json.message);
                renderErrorState(json.message || 'ดึงข้อมูลแดชบอร์ดไม่สำเร็จ');
                return;
            }

            // เซิร์ฟเวอร์ที่ยังรันโค้ดเดิมอยู่จะตอบ success:true แต่ไม่มี period/kpi มาให้
            // ถ้าไม่ดักตรงนี้จะได้ TypeError ที่อ่านไม่รู้เรื่องแทนที่จะบอกสาเหตุจริง
            if (!json.data || !json.data.period || !json.data.kpi) {
                console.error('รูปแบบข้อมูลจาก /dashboard-stats ไม่ตรงกับที่หน้านี้ต้องการ', json.data);
                renderErrorState('เซิร์ฟเวอร์ยังรันโค้ดเดิมอยู่ กรุณารีสตาร์ตเซิร์ฟเวอร์ (npm start) แล้วโหลดหน้านี้ใหม่');
                return;
            }

            _data = json.data;

            // เติมรายชื่อสาขาลง select ครั้งแรกครั้งเดียว (ไม่ล้างค่าที่ผู้ใช้เลือกไว้)
            const branchSel = document.getElementById('dash-filter-branch');
            if (branchSel && branchSel.options.length <= 1) {
                branchSel.insertAdjacentHTML('beforeend', (_data.branches || [])
                    .map(b => `<option value="${esc(b._id)}">${esc(b.name)}</option>`).join(''));
                // พนักงานที่ดูได้แค่สาขาตัวเอง — ล็อกค่าไว้ตามที่ backend บังคับมา
                if (_data.scope && _data.scope.branchId) {
                    branchSel.value = _data.scope.branchId;
                    branchSel.disabled = true;
                }
            }

            const periodLabel = _data.period.isSingleDay
                ? `(${dateTH(_data.period.start)})`
                : `(${dateTH(_data.period.start)} - ${dateTH(_data.period.end)})`;
            const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
            setText('dash-branch-period', periodLabel);
            setText('dash-cash-period', periodLabel);
            setText('dash-cat-period', periodLabel);
            setText('dash-chart-year', `(${new Date(_data.period.end).getFullYear() + 543})`);

            renderKpis(_data);
            renderSalesChart(_data);
            renderCategory(_data);
            renderCashflow(_data);
            renderBranchTable(_data);
            renderTopProducts(_data);
            renderPurchaseOrders(_data);

        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลแดชบอร์ด:', error);
            // เซสชั่นหมดอายุ: script.js เด้งไปหน้าล็อกอินทับอยู่แล้ว ผู้ใช้จึงไม่เห็นข้อความนี้ในทางปฏิบัติ
            // แต่ยังต้องล้างแถวโครงร่างทิ้ง ไม่ปล่อยให้กระพริบค้างเผื่อกรณีที่การเด้งไม่เกิดขึ้น
            const expired = String(error && error.message || '').includes('เซสชั่นหมดอายุ');
            renderErrorState(expired
                ? 'เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่'
                : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
        }
    }

    // ผูก event ครั้งเดียว — loadDashboardData ถูกเรียกซ้ำทุกครั้งที่เข้าหน้านี้
    // ถ้าผูกในนั้นจะได้ listener ซ้อนกันเพิ่มขึ้นเรื่อยๆ
    function bindDashboardControls() {
        if (window.__dashControlsBound) return;
        window.__dashControlsBound = true;

        ['dash-filter-status', 'dash-filter-branch', 'dash-filter-start', 'dash-filter-end']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('change', loadDashboardData);
            });

        const reset = document.getElementById('dash-filter-reset');
        if (reset) reset.addEventListener('click', () => {
            const s = document.getElementById('dash-filter-status');
            const b = document.getElementById('dash-filter-branch');
            if (s) s.value = '';
            if (b && !b.disabled) b.value = '';
            const t = todayISO();
            const st = document.getElementById('dash-filter-start');
            const en = document.getElementById('dash-filter-end');
            if (st) st.value = t;
            if (en) en.value = t;
            loadDashboardData();
        });

        const more = document.getElementById('dash-branch-more');
        if (more) more.addEventListener('click', () => {
            if (typeof window.switchView === 'function') window.switchView('daily-summary');
        });

        // กราฟวาดตามความกว้างจริงของการ์ด จึงต้องวาดใหม่เมื่อขนาดจอเปลี่ยน
        // และเมื่อสลับธีม เพราะสีถูกฝังลงในสตริง SVG ไปแล้ว CSS ตามแก้ไม่ได้
        if (!_resizeBound) {
            _resizeBound = true;
            window.addEventListener("themechange", () => {
                const view = document.getElementById("view-dashboard");
                if (_data && view && !view.classList.contains("hidden")) renderSalesChart(_data);
            });
            let rid = null;
            window.addEventListener('resize', () => {
                clearTimeout(rid);
                rid = setTimeout(() => {
                    const view = document.getElementById('view-dashboard');
                    if (_data && view && !view.classList.contains('hidden')) renderSalesChart(_data);
                }, 200);
            });
        }
    }

    function initDashboard() {
        const st = document.getElementById('dash-filter-start');
        const en = document.getElementById('dash-filter-end');
        if (st && !st.value) st.value = todayISO();
        if (en && !en.value) en.value = todayISO();
        bindDashboardControls();
        loadDashboardData();
    }

    window.loadDashboardData = initDashboard;
    window.initDashboard = initDashboard;
})();
