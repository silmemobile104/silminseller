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

    // จำนวนคอลัมน์ของตาราง (สองแท็บมีไม่เท่ากัน) — อ่านจากหัวตารางจริง ใช้เป็น colspan ของแถวสถานะ/หัวกลุ่ม
    const colCount = (tbody) => {
        const table = tbody.closest('table');
        return table ? table.querySelectorAll('thead th').length : 1;
    };

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ ไม่ปล่อยตารางว่าง (ข้อ 11.7)
    const renderSkeleton = (tbody, rowCount = 6) => {
        const bar = (widthClass) => `<div class="h-3.5 ${widthClass} rounded-full bg-skeleton animate-pulse"></div>`;
        // ลำดับ · รหัส · ชื่อ · (ที่จัดเก็บ) · ราคา · คงเหลือ
        const all = [bar('w-6 mx-auto'), bar('w-20'), bar('w-48'), bar('w-24'), bar('w-16 ml-auto'), bar('w-12 mx-auto')];
        const n = colCount(tbody);
        const cells = n >= all.length ? all : [...all.slice(0, 3), ...all.slice(all.length - (n - 3))];
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `<tr>${cells.map(c => `<td class="px-4 py-4">${c}</td>`).join('')}</tr>`;
        }
        tbody.innerHTML = html;
    };

    // แถวสถานะ (ว่าง / ผิดพลาด) — แถวเดียวกินเต็มความกว้าง (ข้อ 11.7)
    const stateRow = (tbody, message, extraClass = 'text-body-muted italic') =>
        `<tr><td colspan="${colCount(tbody)}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

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

        applySort(key);
        renumber(key);
        renderChips(key);
        updateCount(key);
    };

    // ==========================================
    // กลุ่ม เครื่อง / อุปกรณ์เสริม + เลขลำดับ
    // ==========================================

    const GROUPS = [
        { kind: 'device', label: 'เครื่อง', icon: 'fa-mobile-screen' },
        { kind: 'accessory', label: 'อุปกรณ์เสริม', icon: 'fa-headphones' },
    ];

    // สินค้าไม่มีฟิลด์ item_kind — ใช้กติกาเดียวกับหน้าขาย (checkIsDevice ใน script.js):
    // เครื่อง = มีความจุ/สภาพ/IMEI หรือชื่อประเภทเป็นยี่ห้อ/รุ่นเครื่อง ที่เหลือคืออุปกรณ์เสริม
    const kindOf = (p) => {
        if (!p) return 'device';
        if (typeof window.checkIsDevice === 'function') {
            return window.checkIsDevice(p.type_id ? p.type_id.name : '', p) ? 'device' : 'accessory';
        }
        return (p.type_id && p.type_id.name === 'อุปกรณ์เสริม') ? 'accessory' : 'device';
    };

    // ==========================================
    // เรียงลำดับด้วยการกดหัวคอลัมน์ (เรียงภายในแต่ละกลุ่ม)
    // ==========================================

    const sortState = { mystock: null, globalstock: null };
    const SORTERS = {
        code: (a, b) => (a.dataset.code || '').localeCompare(b.dataset.code || '', 'th', { numeric: true }),
        name: (a, b) => (a.dataset.name || '').localeCompare(b.dataset.name || '', 'th'),
        price: (a, b) => Number(a.dataset.price) - Number(b.dataset.price),
        qty: (a, b) => Number(a.dataset.qty) - Number(b.dataset.qty),
    };

    const applySort = (key) => {
        const s = sortState[key];
        const tbody = document.getElementById(TABS[key].tbody);
        if (!tbody) return;

        document.querySelectorAll(`#content-branch-${key} th[data-sort]`).forEach(th => {
            const arrow = th.querySelector('.sort-arrow');
            if (arrow) arrow.textContent = s && s.by === th.dataset.sort ? (s.dir === 1 ? '▲' : '▼') : '';
        });
        if (!s) return;

        // แยกเป็นช่วงตามหัวกลุ่ม แล้วเรียงเฉพาะแถวข้อมูลในช่วงนั้น
        const segments = [];
        let cur = null;
        Array.from(tbody.children).forEach(tr => {
            if (tr.classList.contains('group-row')) { cur = { header: tr, rows: [] }; segments.push(cur); }
            else if (tr.classList.contains('item-row') && cur) cur.rows.push(tr);
        });
        segments.forEach(seg => {
            seg.rows.sort((a, b) => s.dir * SORTERS[s.by](a, b)).forEach(tr => tbody.appendChild(tr));
        });
        // เอาหัวกลุ่มกลับมาไว้หน้าแถวของตัวเอง
        segments.forEach(seg => seg.rows.length && tbody.insertBefore(seg.header, seg.rows[0]));
    };

    const groupRow = (g, cols) => {
        const tr = document.createElement('tr');
        tr.className = 'group-row bg-panel/40';
        tr.innerHTML = `<td colspan="${cols}" class="px-6 py-3 text-ink font-semibold text-sm">
            <i class="fa-solid ${g.icon} text-body-muted mr-2" aria-hidden="true"></i>${g.label}
            <span class="group-count ml-2 text-xs font-normal text-body-muted"></span></td>`;
        return tr;
    };

    // ใส่แถวทีละกลุ่ม (เครื่องก่อน อุปกรณ์เสริมตามหลัง) โดยคงลำดับเดิมในแต่ละกลุ่ม
    const appendGrouped = (frag, tbody, list, getKind, makeRow) => {
        const cols = colCount(tbody);
        GROUPS.forEach(g => {
            const part = list.filter(x => getKind(x) === g.kind);
            if (!part.length) return;
            frag.appendChild(groupRow(g, cols));
            part.forEach(x => frag.appendChild(makeRow(x)));
        });
    };

    // ตัวเลขลำดับนับใหม่ในแต่ละกลุ่ม เฉพาะแถวที่มองเห็น (หลังค้นหา) และซ่อนหัวกลุ่มที่ไม่มีแถวเหลือ
    const renumber = (key) => {
        const tbody = document.getElementById(TABS[key].tbody);
        if (!tbody) return;
        let header = null, n = 0;
        const closeGroup = () => {
            if (!header) return;
            header.style.display = n ? '' : 'none';
            const c = header.querySelector('.group-count');
            if (c) c.textContent = `${n} รายการ`;
        };
        Array.from(tbody.children).forEach(tr => {
            if (tr.classList.contains('group-row')) {
                closeGroup();
                header = tr;
                n = 0;
            } else if (tr.classList.contains('item-row') && tr.style.display !== 'none') {
                n++;
                const idx = tr.querySelector('.idx-cell');
                if (idx) idx.textContent = n;
            }
        });
        closeGroup();
    };

    // ==========================================
    // สูตรเซลล์ — ตามตารางหน้า #stock (productTableRowMarkup ใน script.js)
    // ==========================================

    const ROW_BASE = 'item-row hover:bg-divider transition-colors';

    // จุดสีประจำแถว — วงกลมเล็ก 16px สีตามสีเครื่อง วางไว้หน้าชื่อ (DESIGN.md ข้อ 11.6)
    // ตัวสร้างอยู่ที่ window.productColorDot ใน script.js ที่เดียว หน้า #stock, #transactions และหน้านี้ใช้ตัวเดียวกัน
    const colorDot = (colorName, colorDoc) =>
        (window.productColorDot ? window.productColorDot(colorName, colorDoc) : '');

    const idxCell = () =>
        '<td class="idx-cell px-4 py-4 text-center text-body-muted font-mono"></td>';

    const codeCell = (p) =>
        `<td class="px-4 py-4"><span class="font-mono text-md font-semibold text-accent-ink">${esc(p.product_code || '-')}</span></td>`;

    // ชื่อ + ความจุ สี สภาพ อยู่บรรทัดเดียวกัน — จุดสี 16px หน้าชื่อ
    // ป้ายหมวดหมู่ตัวเล็กท้ายชื่อ + ป้าย "กำลังโอน" เฉพาะตอนที่ของกำลังโอน (ปกติไม่โชว์สถานะ)
    const nameCell = (p, transferring = false) => {
        const color = p.color_id && p.color_id.name ? p.color_id.name : '';
        const capacity = p.capacity_id && p.capacity_id.name ? p.capacity_id.name : '';
        const condition = p.condition_id && p.condition_id.name ? p.condition_id.name : '';
        const sub = [capacity, color, condition].filter(Boolean).join(' ');
        const cat = p.type_id && p.type_id.name ? p.type_id.name : '';
        const transferBadge = transferring
            ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[0.375rem] bg-state-pending/[0.12] text-state-pending text-xs font-medium"><span class="w-1.5 h-1.5 rounded-full bg-state-pending"></span>กำลังโอน</span>`
            : '';
        return `
            <td class="px-4 py-4 w-full">
                <p class="font-medium text-ink flex items-center gap-2">
                    ${colorDot(color, p.color_id)}<span>${esc(p.name || 'ไม่ระบุชื่อ')}</span>
                    ${sub ? `<span class="text-sm font-normal text-ink/70">${esc(sub)}</span>` : ''}
                    ${cat ? `<span class="px-2 py-0.5 bg-field text-body-muted rounded-[0.375rem] text-xs font-normal">${esc(cat)}</span>` : ''}
                    ${transferBadge}
                </p>
            </td>`;
    };

    const priceCell = (p) =>
        `<td class="px-4 py-4 text-right text-ink font-mono">฿${(Number(p.selling_price) || 0).toLocaleString()}</td>`;

    const qtyCell = (qty, unit) =>
        `<td class="px-4 py-4 text-center text-ink font-medium">${qty} <span class="text-xs text-ink font-normal">${esc(unit || 'ชิ้น')}</span></td>`;

    const buildRow = (cells, searchText, p, qty) => {
        const tr = document.createElement('tr');
        tr.className = ROW_BASE;
        tr.dataset.search = searchText.toLowerCase();
        tr.dataset.code = p.product_code || '';
        tr.dataset.name = p.name || '';
        tr.dataset.price = Number(p.selling_price) || 0;
        tr.dataset.qty = qty;
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

            // กดหัวคอลัมน์: ครั้งแรกเรียงขึ้น ครั้งที่สองเรียงลง ครั้งที่สามยกเลิกการเรียง
            Object.keys(TABS).forEach(key => {
                document.querySelectorAll(`#content-branch-${key} th[data-sort]`).forEach(th => {
                    th.addEventListener('click', () => {
                        const by = th.dataset.sort;
                        const s = sortState[key];
                        if (!s || s.by !== by) sortState[key] = { by, dir: 1 };
                        else if (s.dir === 1) sortState[key] = { by, dir: -1 };
                        else sortState[key] = null;
                        applySearch(key);
                    });
                });
            });

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
    // byGroup = { device: {pieces, value}, accessory: {pieces, value} } — สรุปแยกกลุ่มใต้ตัวเลขรวม
    const setMyStockValue = (value, pieces, byGroup) => {
        const el = document.getElementById('value-branch-mystock');
        const sub = document.getElementById('value-branch-mystock-sub');
        const groupsEl = document.getElementById('value-branch-mystock-groups');
        if (el) el.textContent = value == null ? '-' : `฿${Math.round(value).toLocaleString('th-TH')}`;
        if (sub) sub.textContent = value == null ? '' : `จาก ${pieces.toLocaleString('th-TH')} ชิ้น`;
        if (groupsEl) {
            groupsEl.innerHTML = (value == null || !byGroup) ? '' : GROUPS
                .filter(g => byGroup[g.kind] && byGroup[g.kind].pieces > 0)
                .map(g => `<span class="px-2.5 py-1 rounded-[0.375rem] bg-field text-ink text-xs"><i class="fa-solid ${g.icon} text-body-muted mr-1.5" aria-hidden="true"></i>${g.label} ${byGroup[g.kind].pieces.toLocaleString('th-TH')} ชิ้น · ฿${Math.round(byGroup[g.kind].value).toLocaleString('th-TH')}</span>`)
                .join('');
        }
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
                tbody.innerHTML = stateRow(tbody, 'ไม่พบสินค้าคงเหลือในสาขาของคุณ');
                renderChips('mystock');
                updateCount('mystock');
                setMyStockValue(0, 0);
                return;
            }

            let totalValue = 0, totalPieces = 0;
            const byGroup = { device: { pieces: 0, value: 0 }, accessory: { pieces: 0, value: 0 } };
            const frag = document.createDocumentFragment();
            appendGrouped(frag, tbody, items, kindOf, (p) => {
                const qty = myQty(p);
                const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';
                // จำนวนเดียวกับที่ตารางแสดง (IMEI ถ้ามี ไม่งั้น quantity) × ราคาขายต่อชิ้น
                const lineValue = qty * (Number(p.selling_price) || 0);
                totalValue += lineValue;
                totalPieces += qty;
                const g = byGroup[kindOf(p)];
                g.pieces += qty;
                g.value += lineValue;

                return buildRow(
                    idxCell() + codeCell(p) + nameCell(p, !!p.is_transferring) + priceCell(p) + qtyCell(qty, unit),
                    [p.name, p.product_code, ...(p.imeis || [])].join(' '),
                    p, qty
                );
            });
            tbody.innerHTML = '';
            tbody.appendChild(frag);

            setMyStockValue(totalValue, totalPieces, byGroup);

            // คำค้นที่ค้างอยู่ต้องถูกใช้ซ้ำกับแถวชุดใหม่ ไม่งั้นชิป "ค้นหา: ..." จะโชว์อยู่แต่ตารางไม่ได้กรอง
            applySearch('mystock');
        } catch (err) {
            console.error(err);
            totalGroups.mystock = 0;
            setMyStockValue(null);
            tbody.innerHTML = stateRow(tbody, 'เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-state-danger-soft');
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
                tbody.innerHTML = stateRow(tbody, 'ไม่พบข้อมูลสินค้าในระบบ');
                renderChips('globalstock');
                updateCount('globalstock');
                return;
            }

            const frag = document.createDocumentFragment();
            appendGrouped(frag, tbody, rows, (r) => kindOf(r.p), ({ p, qty, imeis, branch }) => {
                const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';
                return buildRow(
                    idxCell() + codeCell(p) + nameCell(p)
                    + `<td class="px-4 py-4 text-ink text-sm">${esc(branch)}</td>`
                    + priceCell(p) + qtyCell(qty, unit),
                    [p.name, p.product_code, branch, ...imeis].join(' '),
                    p, qty
                );
            });
            tbody.innerHTML = '';
            tbody.appendChild(frag);

            applySearch('globalstock');
        } catch (err) {
            console.error(err);
            totalGroups.globalstock = 0;
            tbody.innerHTML = stateRow(tbody, 'เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-state-danger-soft');
            updateCount('globalstock');
        }
    };

})();
