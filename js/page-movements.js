// Movement Ledger Logic (ระบบประวัติการเคลื่อนไหว)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ประวัติการเคลื่อนไหว" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, API_BASE_URL (global จาก script.js)
(function () {
    const formSearchMovement = document.getElementById('form-search-movement');
    const movementSearchInput = document.getElementById('movement-search-input');
    const movementResultArea = document.getElementById('movement-result-area');
    const movementEmptyState = document.getElementById('movement-empty-state');
    const movementTimeline = document.getElementById('movement-timeline');

    // ชื่อสาขา/เลขเอกสาร/ชื่อผู้ทำรายการมาจากฐานข้อมูลแล้วถูกยัดเข้า innerHTML
    // ของเดิมใส่ดิบๆ ทุกจุดในไทม์ไลน์
    const mvEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // โทนสีของเหตุการณ์ — อยู่ในพาเลตต์ระบบ (ข้อ 11.6) ไม่ใช่ emerald/cyan/indigo/rose แบบเดิม
    const MV_TONES = {
        in: { hex: '#20D500', bg: 'bg-[#42A231]/[0.12]', text: 'text-[#20D500]' },   // ของเข้า
        move: { hex: '#FF9F0A', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' }, // กำลังย้าย
        sale: { hex: '#FFE169', bg: 'bg-[#FFE169]/[0.12]', text: 'text-[#FFE169]' },  // ขายออก
        cancel: { hex: '#FE0000', bg: 'bg-[#FE0000]/[0.12]', text: 'text-[#FE0000]' } // ยกเลิก
    };

    // ⚠️ ค่า action ทั้ง 8 แบบที่ฝั่งเซิร์ฟเวอร์เขียนลงคอลเลกชัน movement จริง
    //    ของเดิม switch รองรับแค่ 4 แบบ ที่เหลือ (รวมถึง "นำเข้าสินค้า (PO)" ซึ่งเป็นแบบที่พบมากที่สุด)
    //    ตกไปที่ default คือมีแต่จุดเทาๆ ไม่มีกล่องรายละเอียดบอกสาขา เลขเอกสาร หรือผู้ทำรายการเลย
    const MV_ACTIONS = {
        'นำเข้าสินค้า (PO)': { icon: 'fa-truck-ramp-box', tone: 'in' },
        'นำเข้าสินค้า': { icon: 'fa-truck-ramp-box', tone: 'in' },
        'รับเข้าสต็อก': { icon: 'fa-arrow-down', tone: 'in' },
        'รับโอนย้าย': { icon: 'fa-box-open', tone: 'in' },
        'ส่งโอนย้าย': { icon: 'fa-truck-fast', tone: 'move' },
        'ขายออก': { icon: 'fa-cash-register', tone: 'sale' },
        'ยกเลิกการโอนย้ายสินค้า': { icon: 'fa-ban', tone: 'cancel' },
        'ยกเลิกการขาย': { icon: 'fa-rotate', tone: 'cancel' }
    };
    const mvConf = (action) => MV_ACTIONS[action] || { icon: 'fa-circle-dot', tone: 'move' };

    const mvSetEmpty = (title, desc) => {
        const t = document.getElementById('movement-empty-title');
        const d = document.getElementById('movement-empty-desc');
        if (t) t.textContent = title;
        if (d) d.textContent = desc;
        if (movementResultArea) movementResultArea.classList.add('hidden');
        if (movementEmptyState) movementEmptyState.classList.remove('hidden');
    };

    // แถวโครงร่างกระพริบระหว่างรอผล (ข้อ 11.7)
    const mvSkeleton = (n = 3) => {
        if (!movementTimeline) return;
        if (movementEmptyState) movementEmptyState.classList.add('hidden');
        if (movementResultArea) movementResultArea.classList.remove('hidden');
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        movementTimeline.innerHTML = Array.from({ length: n }).map(() => `
            <div class="flex gap-4">
                <div class="w-10 h-10 rounded-full bg-[#5c5c5c] animate-pulse shrink-0"></div>
                <div class="flex-1 bg-[#27272A] border border-[#3F3F46] rounded-xl p-4 space-y-2">
                    ${bar('w-40')}${bar('w-full')}${bar('w-2/3')}
                </div>
            </div>`).join('');
        ['mov-product-name', 'mov-product-code', 'mov-type', 'mov-color', 'mov-capacity']
            .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '…'; });
        const c = document.getElementById('movement-count');
        if (c) c.textContent = '';
    };

    if (formSearchMovement) {
        formSearchMovement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const query = movementSearchInput.value.trim();
            if (!query) return;

            const btnSearch = document.getElementById('btn-search-movement');
            const origHtml = btnSearch ? btnSearch.innerHTML : '';
            if (btnSearch) {
                btnSearch.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังค้นหา...';
                btnSearch.disabled = true;
            }
            mvSkeleton();

            try {
                const response = await window.authFetch(`${API_BASE_URL}/movements/search?query=${encodeURIComponent(query)}`);
                const res = await response.json();
                if (res && res.success) {
                    renderMovementResult(res.data);
                } else {
                    mvSetEmpty('ไม่พบข้อมูล',
                        res && res.message ? res.message : `ไม่พบสินค้าหรือ IMEI "${query}" ในระบบ ลองตรวจสอบเลขอีกครั้ง`);
                }
            } catch (error) {
                console.error('Error searching movement:', error);
                window.showToast('เกิดข้อผิดพลาดในการค้นหาประวัติ', 'error');
                mvSetEmpty('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'ลองกดค้นหาอีกครั้ง หรือตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
            } finally {
                if (btnSearch) {
                    btnSearch.innerHTML = origHtml;
                    btnSearch.disabled = false;
                }
            }
        });
    }

    // แถวรายละเอียดหนึ่งบรรทัด สร้างเฉพาะเมื่อมีค่าจริง — ทุก action จึงแสดงเท่าที่ตัวเองมี
    // ไม่ต้องเขียนกล่องรายละเอียดแยกรายชนิดเหมือนของเดิม (ที่เขียนไว้แค่ 4 ชนิด)
    const mvRow = (icon, label, value, valueClass = 'text-white') => value
        ? `<p class="flex items-center gap-2 text-xs">
               <i class="fa-solid ${icon} text-white/70 w-4 text-center"></i>
               <span class="text-white/70">${mvEsc(label)}</span>
               <span class="${valueClass} font-medium">${mvEsc(value)}</span>
           </p>`
        : '';

    function renderMovementResult(data) {
        if (movementEmptyState) movementEmptyState.classList.add('hidden');
        if (movementResultArea) movementResultArea.classList.remove('hidden');

        const p = data.product || {};
        document.getElementById('mov-product-name').textContent = p.name || '-';
        document.getElementById('mov-product-code').textContent = p.product_code || '-';
        document.getElementById('mov-type').textContent = p.type || 'ไม่ระบุ';
        document.getElementById('mov-color').textContent = p.color || 'ไม่ระบุ';
        document.getElementById('mov-capacity').textContent = p.capacity || 'ไม่ระบุ';

        const badge = document.getElementById('mov-query-badge');
        if (data.is_imei_search) {
            document.getElementById('mov-query-text').textContent = data.searched_query || '-';
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        const movements = data.movements || [];
        const countEl = document.getElementById('movement-count');
        if (countEl) countEl.textContent = movements.length ? `ทั้งหมด ${movements.length} เหตุการณ์` : '';

        if (!movements.length) {
            movementTimeline.innerHTML =
                '<p class="py-8 text-center text-white/50 italic">ยังไม่มีประวัติการเคลื่อนไหวของสินค้าชิ้นนี้</p>';
            return;
        }

        movementTimeline.innerHTML = movements.map((mov, index) => {
            const isLatest = index === 0;
            const conf = mvConf(mov.action);
            const tone = MV_TONES[conf.tone];
            const dt = new Date(mov.created_at);
            const dateStr = isNaN(dt) ? '-' : dt.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
            const timeStr = isNaN(dt) ? '' : dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

            const rows = [
                mvRow('fa-store', 'จากสาขา', mov.from_branch && mov.from_branch.name),
                mvRow('fa-location-dot', 'ไปยังสาขา', mov.to_branch && mov.to_branch.name, tone.text),
                mvRow('fa-file-invoice', 'เลขที่เอกสาร', mov.reference_no, 'text-[#FFE169] font-mono'),
                mvRow('fa-stopwatch', 'ใช้เวลาขนส่ง',
                    mov.transit_hours ? `${Number(mov.transit_hours).toFixed(1)} ชั่วโมง` : ''),
                mvRow('fa-tag', 'IMEI', !data.is_imei_search ? mov.imei : '', 'text-white font-mono'),
                mvRow('fa-cubes', 'จำนวน',
                    (!data.is_imei_search && !mov.imei && mov.quantity) ? `${mov.quantity} ชิ้น` : ''),
                mvRow('fa-user', 'ผู้ทำรายการ', mov.created_by && mov.created_by.name)
            ].filter(Boolean).join('');

            return `
            <div class="flex gap-4">
                <div class="flex flex-col items-center shrink-0">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                         style="color:${tone.hex};background-color:#27272A;border:1px solid ${tone.hex}59;">
                        <i class="fa-solid ${mvEsc(conf.icon)}"></i>
                    </div>
                    ${index < movements.length - 1 ? '<div class="w-px flex-1 bg-[#3F3F46] mt-2"></div>' : ''}
                </div>
                <div class="flex-1 min-w-0 bg-[#27272A] border ${isLatest ? 'border-[#FFE169]' : 'border-[#3F3F46]'} rounded-xl p-4 mb-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                            <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${tone.bg}">
                                <span class="w-2 h-2 rounded-full" style="background-color:${tone.hex}"></span>
                                <span class="${tone.text} font-medium text-xs">${mvEsc(mov.action || '-')}</span>
                            </span>
                            ${isLatest ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFE169] text-[#333333]">ล่าสุด</span>' : ''}
                        </div>
                        <span class="text-xs text-white/70 font-mono">${mvEsc(dateStr)} ${mvEsc(timeStr)}</span>
                    </div>
                    ${rows ? `<div class="mt-3 space-y-1.5">${rows}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }
})();
