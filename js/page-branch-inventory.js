// Branch Inventory Logic (สินค้าในสาขา)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "สินค้าในสาขา" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.masterDataCache, API_BASE_URL (global จาก script.js)
//
// หน้านี้เดินตามแบบแปลนหน้า #stock ใน DESIGN.md ข้อ 11:
//   - แถบควบคุม + ชิปตัวกรอง + ตาราง อยู่ในการ์ดใบเดียว
//   - ตารางแบนเหมือน #stock: 1 แถว = 1 รายการ ทุกเซลล์ px-6 py-4 ค่าเดียว
//   - รหัสสินค้าเป็นสีเหลือง, เงินเป็น font-mono ชิดขวา, สถานะเป็นป้ายจุด + tint 12%
(function () {
    let isBranchInventoryInitialized = false;

    // ค่าคงที่ของสองแท็บ — ทุกฟังก์ชันด้านล่างรับ key ('mystock' | 'globalstock') แล้วอ่านจากตารางนี้
    // ทำให้ตรรกะค้นหา/ชิป/ตัวนับใช้โค้ดชุดเดียวร่วมกันได้ทั้งสองแท็บ
    const TABS = {
        mystock: {
            search: 'search-branch-mystock',
            type: 'filter-branch-mystock-type',
            condition: 'filter-branch-mystock-condition',
            chips: 'chips-branch-mystock',
            count: 'count-branch-mystock',
            tbody: 'table-body-branch-mystock',
            reload: () => window.loadBranchInventoryMyStock(),
        },
        globalstock: {
            search: 'search-branch-globalstock',
            type: 'filter-branch-globalstock-type',
            condition: 'filter-branch-globalstock-condition',
            branch: 'filter-branch-globalstock-branch',
            chips: 'chips-branch-globalstock',
            count: 'count-branch-globalstock',
            tbody: 'table-body-branch-globalstock',
            reload: () => window.loadBranchInventoryGlobalStock(),
        },
    };

    // จำนวนแถวทั้งหมด "ก่อน" กรองประเภท/สภาพ — ใช้เป็นตัวหารใน "แสดง N จาก M รายการ"
    // ถ้าเอาจำนวนแถวที่เรนเดอร์จริงมาเป็นตัวหาร ตัวเลขจะเท่ากันสองข้างเสมอ ไม่บอกอะไรเลย
    const totalGroups = { mystock: 0, globalstock: 0 };


    // ==========================================
    // ชิ้นส่วน UI ที่ใช้ซ้ำ (ตาม DESIGN.md ข้อ 11.5 - 11.7)
    // ==========================================

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ตารางทั้งสองแท็บมี 6 คอลัมน์ — colspan ของแถวสถานะ/โครงร่างต้องเป็น 6
    const COLS = 6;

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ ไม่ปล่อยตารางว่าง (ข้อ 11.7)
    const renderSkeleton = (tbody, rowCount = 6) => {
        const bar = (widthClass) => `<div class="h-3.5 ${widthClass} rounded-full bg-skeleton animate-pulse"></div>`;
        const cells = [bar('w-20'), bar('w-48'), bar('w-24'), bar('w-16 ml-auto'), bar('w-12 mx-auto'), bar('w-20')];
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `<tr>${cells.map(c => `<td class="px-6 py-4">${c}</td>`).join('')}</tr>`;
        }
        tbody.innerHTML = html;
    };

    // แถวสถานะ (ว่าง / ผิดพลาด) — แถวเดียวกินเต็มความกว้าง (ข้อ 11.7)
    const stateRow = (message, extraClass = 'text-body-muted italic') =>
        `<tr><td colspan="${COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    const selectedText = (selectEl) => {
        if (!selectEl) return '';
        const opt = selectEl.options[selectEl.selectedIndex];
        return opt ? opt.textContent.trim() : '';
    };

    const updateCount = (key) => {
        const t = TABS[key];
        const tbody = document.getElementById(t.tbody);
        const el = document.getElementById(t.count);
        if (!tbody || !el) return;

        // ยังไม่มีข้อมูล (กำลังโหลด / ไม่พบสินค้า) — ไม่ต้องโชว์ "แสดง 0 จาก 0 รายการ" ให้รก
        if (!totalGroups[key]) {
            el.textContent = '';
            return;
        }
        const rows = tbody.querySelectorAll('tr.item-row');
        const visible = Array.from(rows).filter(r => r.style.display !== 'none').length;
        el.textContent = `แสดง ${visible} จาก ${totalGroups[key]} รายการ`;
    };

    const renderChips = (key) => {
        const t = TABS[key];
        const box = document.getElementById(t.chips);
        if (!box) return;
        box.innerHTML = '';

        const searchEl = document.getElementById(t.search);
        const typeEl = document.getElementById(t.type);
        const condEl = document.getElementById(t.condition);
        const branchEl = t.branch ? document.getElementById(t.branch) : null;

        const addChip = (label, onRemove) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'pl-3.5 pr-2.5 py-1.5 rounded-xl bg-field text-ink text-sm transition-colors flex items-center gap-2';
            chip.setAttribute('aria-label', `ลบตัวกรอง ${label}`);
            chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] text-body-muted hover:text-ink cursor-pointer p-1"></i>`;
            chip.addEventListener('click', (e) => {
                // ลบได้เฉพาะตอนคลิกที่กากบาท ตัวชิปเองไม่ตอบสนอง (ข้อ 11.5)
                if (!e.target.closest('i.fa-xmark')) return;
                onRemove();
            });
            box.appendChild(chip);
        };

        let activeCount = 0;

        const term = (searchEl && searchEl.value || '').trim();
        if (term) {
            activeCount++;
            addChip(`ค้นหา: ${term}`, () => {
                searchEl.value = '';
                applySearch(key);
            });
        }
        if (typeEl && typeEl.value !== 'ALL') {
            activeCount++;
            addChip(`ประเภท: ${selectedText(typeEl)}`, () => {
                typeEl.value = 'ALL';
                t.reload();
            });
        }
        if (branchEl && branchEl.value !== 'ALL') {
            activeCount++;
            addChip(`ที่จัดเก็บ: ${branchEl.value}`, () => {
                branchEl.value = 'ALL';
                t.reload();
            });
        }
        if (condEl && condEl.value !== 'ALL') {
            activeCount++;
            addChip(`สภาพ: ${selectedText(condEl).replace(/^สภาพ:\s*/, '')}`, () => {
                condEl.value = 'ALL';
                t.reload();
            });
        }

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น (ข้อ 11.5)
        if (activeCount > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-state-danger/10 hover:bg-state-danger/15 text-state-danger-soft rounded-full text-xs font-medium transition-colors cursor-pointer';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', () => {
                if (searchEl) searchEl.value = '';
                if (typeEl) typeEl.value = 'ALL';
                if (condEl) condEl.value = 'ALL';
                if (branchEl) branchEl.value = 'ALL';
                t.reload();
            });
            box.appendChild(clearBtn);
        }
    };


    // ค้นหาแบบซ่อน/แสดงแถวที่เรนเดอร์ไว้แล้ว (ไม่ยิง API ใหม่)
    // ค้นจาก data-search ของแถว (ชื่อ/รหัส/สาขา/IMEI) ไม่ใช่ข้อความที่เห็น — IMEI ไม่ได้แสดงในตารางแต่ยังค้นเจอ
    const applySearch = (key) => {
        const t = TABS[key];
        const tbody = document.getElementById(t.tbody);
        const input = document.getElementById(t.search);
        if (!tbody || !input) return;

        const term = input.value.toLowerCase().trim();
        tbody.querySelectorAll('tr.item-row').forEach(row => {
            row.style.display = (!term || (row.dataset.search || '').includes(term)) ? '' : 'none';
        });

        renderChips(key);
        updateCount(key);
    };

    // ==========================================
    // สูตรเซลล์ — ตามตารางหน้า #stock (productTableRowMarkup ใน script.js)
    // ==========================================

    const ROW_BASE = 'item-row hover:bg-divider transition-colors';

    // จุดสีประจำแถว — วงกลมเล็ก 16px สีตามสีเครื่อง วางไว้หน้าชื่อ (DESIGN.md ข้อ 11.6)
    // ตัวสร้างอยู่ที่ window.productColorDot ใน script.js ที่เดียว หน้า #stock, #transactions และหน้านี้ใช้ตัวเดียวกัน
    const colorDot = (colorName, colorDoc) =>
        (window.productColorDot ? window.productColorDot(colorName, colorDoc) : '');

    const codeCell = (p) =>
        `<td class="px-6 py-4"><span class="font-mono text-md font-semibold text-accent-ink">${esc(p.product_code || '-')}</span></td>`;

    // ชื่อ + คำบรรยาย (ความจุ สี สภาพ) — จุดสี 16px หน้าชื่อ
    const nameCell = (p) => {
        const color = p.color_id && p.color_id.name ? p.color_id.name : '';
        const capacity = p.capacity_id && p.capacity_id.name ? p.capacity_id.name : '';
        const condition = p.condition_id && p.condition_id.name ? p.condition_id.name : '';
        const sub = [capacity, color, condition].filter(Boolean).join(' ');
        return `
            <td class="px-6 py-4">
                <p class="font-medium text-ink flex items-center gap-2">
                    ${colorDot(color, p.color_id)}<span>${esc(p.name || 'ไม่ระบุชื่อ')}</span>
                </p>
                <p class="text-xs pl-6 text-ink/70">${esc(sub) || '-'}</p>
            </td>`;
    };

    const categoryCell = (p) => {
        const cat = p.type_id && p.type_id.name ? p.type_id.name : 'ทั่วไป';
        return `<td class="px-6 py-4"><span class="px-2.5 py-1 bg-field text-body-muted rounded-[0.375rem] text-xs font-medium">${esc(cat)}</span></td>`;
    };

    const priceCell = (p) =>
        `<td class="px-6 py-4 text-right text-ink font-mono">฿${(Number(p.selling_price) || 0).toLocaleString()}</td>`;

    const qtyCell = (qty, unit) =>
        `<td class="px-6 py-4 text-center text-ink font-medium">${qty} <span class="text-xs text-ink font-normal">${esc(unit || 'ชิ้น')}</span></td>`;

    // ป้ายสถานะ — จุดสี + tint 12% (ข้อ 11.6)
    const statusCell = (transferring) => transferring
        ? `<td class="px-6 py-4"><div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-state-pending/[0.12]"><div class="w-2 h-2 rounded-full bg-state-pending"></div><span class="text-state-pending font-medium text-xs">กำลังโอน</span></div></td>`
        : `<td class="px-6 py-4"><div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#42A231]/[0.12]"><div class="w-2 h-2 rounded-full bg-[#20D500]"></div><span class="text-[#20D500] font-medium text-xs">ปกติ</span></div></td>`;

    const buildRow = (cells, searchText) => {
        const tr = document.createElement('tr');
        tr.className = ROW_BASE;
        tr.dataset.search = searchText.toLowerCase();
        tr.innerHTML = cells;
        return tr;
    };

    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th')
        || String(a.product_code || '').localeCompare(String(b.product_code || ''));

    const matchesFilters = (p, typeFilter, condFilter) => {
        if (typeFilter !== 'ALL' && (p.type_id ? p.type_id.name : '') !== typeFilter) return false;
        if (condFilter !== 'ALL') {
            const condName = p.condition_id ? p.condition_id.name : '';
            if (condName.replace(/\s+/g, '') !== condFilter.replace(/\s+/g, '')) return false;
        }
        return true;
    };

    // ==========================================
    // Init
    // ==========================================

    window.initBranchInventory = () => {
        if (!isBranchInventoryInitialized) {
            const tabMyStock = document.getElementById('tab-branch-mystock');
            const tabGlobalStock = document.getElementById('tab-branch-globalstock');
            const contentMyStock = document.getElementById('content-branch-mystock');
            const contentGlobalStock = document.getElementById('content-branch-globalstock');

            // ตัวสลับแบบ segmented (กรอบพื้น bg-field ใน HTML): ใบที่เลือก = พื้นยก + ขอบ/ตัวอักษรเหลือง
            // ไม่ใช้เหลืองทึบ — ข้อ 11.9 "เลือกแล้วเปลี่ยนขอบ ไม่ใช่เปลี่ยนพื้น"
            // เขียนเป็น className เต็มแทนการ add/remove ทีละคลาส (แบบเดียวกับแท็บหน้าอื่นทั้งหมดในระบบ)
            // ไม่งั้นคลาสจากมาร์กอัปตั้งต้นจะตกค้างและปุ่มมีเส้นขอบหนาไม่เท่ากัน
            const TAB_BASE = 'tab-toggle-btn flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus';
            const TAB_ON = 'bg-surface-chip text-accent-ink ring-1 ring-accent-ink';
            const TAB_OFF = 'text-body-muted hover:text-ink';

            const activateTab = (activeTab, inactiveTab, activeContent, inactiveContent) => {
                activeTab.className = `${TAB_BASE} ${TAB_ON}`;
                activeTab.setAttribute('aria-pressed', 'true');

                inactiveTab.className = `${TAB_BASE} ${TAB_OFF}`;
                inactiveTab.setAttribute('aria-pressed', 'false');

                activeContent.classList.remove('hidden');
                inactiveContent.classList.add('hidden');
            };

            if (tabMyStock && tabGlobalStock) {
                // มาร์กอัปตั้งต้นของแท็บ "สินค้าในสาขาของฉัน" ยังไม่มีคลาส tab-toggle-btn/
                // apple-active-accent (ใส่เฉพาะตอน activateTab สลับแท็บ) เรียกครั้งแรกให้ตรงกัน
                // ตั้งแต่เปิดหน้า ไม่งั้นแท็บที่ active อยู่ตั้งแต่ต้นจะยังมีเส้นขอบเดิมค้างอยู่ในโหมดสว่าง
                activateTab(tabMyStock, tabGlobalStock, contentMyStock, contentGlobalStock);

                tabMyStock.addEventListener('click', () => {
                    activateTab(tabMyStock, tabGlobalStock, contentMyStock, contentGlobalStock);
                    window.loadBranchInventoryMyStock();
                });
                tabGlobalStock.addEventListener('click', () => {
                    activateTab(tabGlobalStock, tabMyStock, contentGlobalStock, contentMyStock);
                    window.loadBranchInventoryGlobalStock();
                });
            }

            document.getElementById('btn-refresh-mystock')?.addEventListener('click', () => window.loadBranchInventoryMyStock());
            document.getElementById('btn-refresh-globalstock')?.addEventListener('click', () => window.loadBranchInventoryGlobalStock());

            // เติมตัวเลือก "ประเภทสินค้า" จาก master data (ต่อสตริงครั้งเดียว ไม่ += ใน loop)
            const md = window.masterDataCache || {};
            const populateTypeFilter = (filterId) => {
                const filter = document.getElementById(filterId);
                if (!filter || !md.productTypes) return;
                filter.innerHTML = '<option value="ALL">ประเภท: ทั้งหมด</option>'
                    + md.productTypes.map(type => `<option value="${type.name}">${type.name}</option>`).join('');
            };
            populateTypeFilter('filter-branch-mystock-type');
            populateTypeFilter('filter-branch-globalstock-type');

            Object.keys(TABS).forEach(key => {
                const t = TABS[key];
                document.getElementById(t.type)?.addEventListener('change', t.reload);
                document.getElementById(t.condition)?.addEventListener('change', t.reload);
                if (t.branch) document.getElementById(t.branch)?.addEventListener('change', t.reload);
                document.getElementById(t.search)?.addEventListener('input', () => applySearch(key));
            });

            isBranchInventoryInitialized = true;
        }

        window.loadBranchInventoryMyStock();
    };


    // ==========================================
    // แท็บ 1: สต็อกในสาขาของฉัน — ตารางแบนเหมือน #stock (1 แถว = 1 รายการสินค้า)
    // ==========================================

    // มูลค่ารวมของสต็อกในสาขา (ราคาขาย) — null = ยังไม่มีตัวเลข (กำลังโหลด / โหลดไม่สำเร็จ)
    const setMyStockValue = (value, pieces) => {
        const el = document.getElementById('value-branch-mystock');
        const sub = document.getElementById('value-branch-mystock-sub');
        if (el) el.textContent = value == null ? '-' : `฿${Math.round(value).toLocaleString('th-TH')}`;
        if (sub) sub.textContent = value == null ? '' : `จาก ${pieces.toLocaleString('th-TH')} ชิ้น`;
    };

    const myQty = (p) => {
        const imeiCount = (p.imeis && p.imeis.length) ? p.imeis.length : 0;
        return imeiCount > 0 ? imeiCount : (Number(p.quantity) || 0);
    };

    window.loadBranchInventoryMyStock = async () => {
        const tbody = document.getElementById('table-body-branch-mystock');
        if (!tbody) return;

        totalGroups.mystock = 0;
        updateCount('mystock');
        renderChips('mystock');
        setMyStockValue(null);
        renderSkeleton(tbody);

        try {
            const res = await authFetch(`${API_BASE_URL}/products`); // endpoint ปกติ = สาขาของผู้ใช้เอง
            const data = await res.json();
            if (!data.success) return;

            const baseItems = data.data.filter(p => Number(p.quantity || 0) > 0 && myQty(p) > 0);
            // ตัวหารของตัวนับ = จำนวนรายการทั้งหมดก่อนกรองประเภท/สภาพ
            totalGroups.mystock = baseItems.length;

            const typeFilter = document.getElementById('filter-branch-mystock-type')?.value || 'ALL';
            const condFilter = document.getElementById('filter-branch-mystock-condition')?.value || 'ALL';
            const items = baseItems.filter(p => matchesFilters(p, typeFilter, condFilter)).sort(byName);

            if (items.length === 0) {
                tbody.innerHTML = stateRow('ไม่พบสินค้าคงเหลือในสาขาของคุณ');
                renderChips('mystock');
                updateCount('mystock');
                setMyStockValue(0, 0);
                return;
            }

            let totalValue = 0, totalPieces = 0;
            const frag = document.createDocumentFragment();
            items.forEach(p => {
                const qty = myQty(p);
                const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';
                // จำนวนเดียวกับที่ตารางแสดง (IMEI ถ้ามี ไม่งั้น quantity) × ราคาขายต่อชิ้น
                totalValue += qty * (Number(p.selling_price) || 0);
                totalPieces += qty;

                frag.appendChild(buildRow(
                    codeCell(p) + nameCell(p) + categoryCell(p) + priceCell(p) + qtyCell(qty, unit) + statusCell(!!p.is_transferring),
                    [p.name, p.product_code, ...(p.imeis || [])].join(' ')
                ));
            });
            tbody.innerHTML = '';
            tbody.appendChild(frag);

            setMyStockValue(totalValue, totalPieces);

            // คำค้นที่ค้างอยู่ต้องถูกใช้ซ้ำกับแถวชุดใหม่ ไม่งั้นชิป "ค้นหา: ..." จะโชว์อยู่แต่ตารางไม่ได้กรอง
            applySearch('mystock');
        } catch (err) {
            console.error(err);
            totalGroups.mystock = 0;
            setMyStockValue(null);
            tbody.innerHTML = stateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-state-danger-soft');
            updateCount('mystock');
        }
    };

    // ==========================================
    // แท็บ 2: สต็อกและราคาอ้างอิงทุกสาขา — 1 แถว = 1 สินค้า × 1 สาขา
    // ==========================================

    // กระจาย stock_balances ของแต่ละสินค้าเป็นแถว (สินค้า × สาขา) เฉพาะสาขาที่มีของ
    const expandBranchRows = (products) => {
        const rows = [];
        products.forEach(p => {
            (p.stock_balances || []).forEach(b => {
                const qty = (b.imeis && b.imeis.length > 0) ? b.imeis.length : (b.quantity || 0);
                if (qty <= 0) return;
                rows.push({ p, qty, imeis: b.imeis || [], branch: b.branch_id ? (b.branch_id.name || 'ไม่ทราบสาขา') : 'ไม่ทราบสาขา' });
            });
        });
        return rows;
    };

    window.loadBranchInventoryGlobalStock = async () => {
        const tbody = document.getElementById('table-body-branch-globalstock');
        if (!tbody) return;

        totalGroups.globalstock = 0;
        updateCount('globalstock');
        renderChips('globalstock');
        renderSkeleton(tbody);

        try {
            const res = await authFetch(`${API_BASE_URL}/products/global-stock`);
            const data = await res.json();
            if (!data.success) return;

            const baseItems = data.data.filter(p => Number(p.global_total_quantity || 0) > 0);
            totalGroups.globalstock = expandBranchRows(baseItems).length;

            const typeFilter = document.getElementById('filter-branch-globalstock-type')?.value || 'ALL';
            const condFilter = document.getElementById('filter-branch-globalstock-condition')?.value || 'ALL';
            const allRows = expandBranchRows(baseItems.filter(p => matchesFilters(p, typeFilter, condFilter)));

            // ตัวเลือก "ที่จัดเก็บ" มาจากสาขาที่มีของจริง — คงค่าที่เลือกไว้ตอนรีโหลด
            const branchEl = document.getElementById('filter-branch-globalstock-branch');
            const branchFilter = branchEl?.value || 'ALL';
            if (branchEl) {
                const names = [...new Set(expandBranchRows(baseItems).map(r => r.branch))].sort((a, b) => a.localeCompare(b, 'th'));
                branchEl.innerHTML = '<option value="ALL">ที่จัดเก็บ: ทั้งหมด</option>'
                    + names.map(n => `<option value="${esc(n)}">ที่จัดเก็บ: ${esc(n)}</option>`).join('');
                branchEl.value = names.includes(branchFilter) ? branchFilter : 'ALL';
            }
            const rows = allRows.filter(r => branchFilter === 'ALL' || r.branch === branchFilter)
                .sort((a, b) => byName(a.p, b.p) || a.branch.localeCompare(b.branch, 'th'));

            if (rows.length === 0) {
                tbody.innerHTML = stateRow('ไม่พบข้อมูลสินค้าในระบบ');
                renderChips('globalstock');
                updateCount('globalstock');
                return;
            }

            const frag = document.createDocumentFragment();
            rows.forEach(({ p, qty, imeis, branch }) => {
                const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';
                frag.appendChild(buildRow(
                    codeCell(p) + nameCell(p)
                    + `<td class="px-6 py-4 text-ink text-sm">${esc(branch)}</td>`
                    + categoryCell(p) + priceCell(p) + qtyCell(qty, unit),
                    [p.name, p.product_code, branch, ...imeis].join(' ')
                ));
            });
            tbody.innerHTML = '';
            tbody.appendChild(frag);

            applySearch('globalstock');
        } catch (err) {
            console.error(err);
            totalGroups.globalstock = 0;
            tbody.innerHTML = stateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-state-danger-soft');
            updateCount('globalstock');
        }
    };

})();
