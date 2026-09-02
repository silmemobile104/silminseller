// Branch Inventory Logic (สินค้าในสาขา)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "สินค้าในสาขา" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.masterDataCache, API_BASE_URL (global จาก script.js)
//
// หน้านี้เดินตามแบบแปลนหน้า #stock ใน DESIGN.md ข้อ 11:
//   - แถบควบคุม + ชิปตัวกรอง + ตาราง อยู่ในการ์ดใบเดียว
//   - ทุกเซลล์ px-6 py-4 ค่าเดียว ลำดับชั้นของ tree สื่อด้วยการเยื้อง (ml-6 / ml-12) ไม่ใช่ padding ที่ต่างกัน
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
            chips: 'chips-branch-globalstock',
            count: 'count-branch-globalstock',
            tbody: 'table-body-branch-globalstock',
            reload: () => window.loadBranchInventoryGlobalStock(),
        },
    };

    // จำนวนกลุ่มสินค้าทั้งหมด "ก่อน" กรองประเภท/สภาพ — ใช้เป็นตัวหารใน "แสดง N จาก M รายการ"
    // ถ้าเอาจำนวนแถวที่เรนเดอร์จริงมาเป็นตัวหาร ตัวเลขจะเท่ากันสองข้างเสมอ ไม่บอกอะไรเลย
    const totalGroups = { mystock: 0, globalstock: 0 };

    // ==========================================
    // ชิ้นส่วน UI ที่ใช้ซ้ำ (ตาม DESIGN.md ข้อ 11.5 - 11.7)
    // ==========================================

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ ไม่ปล่อยตารางว่าง (ข้อ 11.7)
    const renderSkeleton = (tbody, rowCount = 6) => {
        const bar = (widthClass) => `<div class="h-3.5 ${widthClass} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `
                <tr>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-4 h-4 rounded-full bg-[#5c5c5c] animate-pulse shrink-0"></div>
                            ${bar('w-48')}
                        </div>
                    </td>
                    <td class="px-6 py-4">${bar('w-16 mx-auto')}</td>
                    <td class="px-6 py-4">${bar('w-20 ml-auto')}</td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
    };

    // แถวสถานะ (ว่าง / ผิดพลาด) — ตารางมี 3 คอลัมน์ colspan ต้องเป็น 3
    const stateRow = (message, extraClass = 'text-white/50 italic') =>
        `<tr><td colspan="3" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

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
        const nameRows = tbody.querySelectorAll('tr.name-row');
        const visible = Array.from(nameRows).filter(r => r.style.display !== 'none').length;
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

        const addChip = (label, onRemove) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] text-white text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
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
        if (condEl && condEl.value !== 'ALL') {
            activeCount++;
            addChip(`สภาพ: ${selectedText(condEl)}`, () => {
                condEl.value = 'ALL';
                t.reload();
            });
        }

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น (ข้อ 11.5)
        if (activeCount > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium border border-red-500/30 transition-colors';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', () => {
                if (searchEl) searchEl.value = '';
                if (typeEl) typeEl.value = 'ALL';
                if (condEl) condEl.value = 'ALL';
                t.reload();
            });
            box.appendChild(clearBtn);
        }
    };

    // ค้นหาแบบซ่อน/แสดงแถวที่เรนเดอร์ไว้แล้ว (ไม่ยิง API ใหม่)
    // แถวที่ตรงคำค้นจะถูกแสดง พร้อมกางแถวแม่ทุกชั้นขึ้นมาให้เห็นบริบทด้วย
    const applySearch = (key) => {
        const t = TABS[key];
        const tbody = document.getElementById(t.tbody);
        const input = document.getElementById(t.search);
        if (!tbody || !input) return;

        // ตารางยังไม่มีข้อมูลจริง (กำลังโหลด / ว่าง / error) — อย่าไปยุ่งกับแถวสถานะ
        // ไม่งั้นข้อความ "ไม่พบสินค้า" จะโดนสั่ง .hidden ไปด้วยเพราะมันไม่ใช่ .name-row
        if (!tbody.querySelector('tr.name-row')) {
            renderChips(key);
            updateCount(key);
            return;
        }

        const term = input.value.toLowerCase().trim();
        const rows = Array.from(tbody.children);

        if (term === '') {
            // กลับสู่สถานะเริ่มต้น: เห็นเฉพาะแถวระดับ 1 และลูกศรทุกตัวชี้ขวา
            rows.forEach(row => {
                row.style.display = '';
                const icon = row.querySelector('i.fa-solid');
                const btn = row.querySelector('button[aria-expanded]');
                if (row.classList.contains('name-row')) {
                    if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                } else {
                    row.classList.add('hidden');
                    if (row.classList.contains('level2-row')) {
                        if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                        if (btn) btn.setAttribute('aria-expanded', 'false');
                    }
                }
            });
            renderChips(key);
            updateCount(key);
            return;
        }

        rows.forEach(row => { row.style.display = 'none'; });

        const parentsToShow = new Set();
        rows.forEach(row => {
            if (row.textContent.toLowerCase().includes(term)) {
                row.style.display = '';
                row.classList.remove('hidden');
                row.classList.forEach(cls => {
                    if (cls.startsWith('child-of-')) parentsToShow.add(cls.replace('child-of-', ''));
                });
            }
        });

        rows.forEach(row => {
            parentsToShow.forEach(parentId => {
                if (row.classList.contains(parentId)) {
                    row.style.display = '';
                    row.classList.remove('hidden');
                    const icon = row.querySelector('i.fa-solid');
                    if (icon && icon.classList.contains('fa-chevron-right')) {
                        icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                    }
                    const btn = row.querySelector('button[aria-expanded]');
                    if (btn) btn.setAttribute('aria-expanded', 'true');
                }
            });
        });

        renderChips(key);
        updateCount(key);
    };

    // ==========================================
    // สูตรแถวของ tree 3 ระดับ
    // ระดับชั้นสื่อด้วยการเยื้อง (ml-6 / ml-12) + ลูกศร + น้ำหนักตัวอักษร
    // ไม่ใช่ด้วยสีพื้นคนละเฉด — เซลล์ทุกใบจึงยังเป็น px-6 py-4 ค่าเดียวตามข้อ 11.6
    // ==========================================

    const ROW_BASE = 'hover:bg-[#464646] transition-colors';

    // ปุ่มกาง/ยุบ — ต้องเป็น <button> จริง ไม่ใช่ onclick บน <tr>
    // เพราะ <tr> โฟกัสด้วยคีย์บอร์ดไม่ได้ และการใส่ role="button" ให้ <tr> จะพัง semantics ของตาราง
    const disclosureButton = (rowId, indentClass, iconExtraClass, labelHtml) => `
        <button type="button" id="btn-${rowId}" aria-expanded="false"
            class="flex items-center gap-2 w-full text-left cursor-pointer rounded-[0.375rem] ${indentClass}">
            <i id="icon-${rowId}" class="fa-solid fa-chevron-right text-white/70 w-4 text-center shrink-0 ${iconExtraClass}"></i>
            ${labelHtml}
        </button>
    `;

    // จุดสีประจำแถว — วงกลมเล็ก 16px สีตามสีเครื่อง วางไว้หน้าชื่อ (DESIGN.md ข้อ 11.6)
    // ตัวสร้างอยู่ที่ window.productColorDot ใน script.js ที่เดียว หน้า #stock, #transactions และหน้านี้ใช้ตัวเดียวกัน
    const colorDot = (colorName, colorDoc) =>
        (window.productColorDot ? window.productColorDot(colorName, colorDoc) : '');

    // ป้ายจำนวนรวมของกลุ่ม — ใช้ไวยากรณ์ชิปเดียวกับข้อ 11.5
    const groupQtyBadge = (qty, unit) => `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-[0.375rem] bg-[#4D4D4D]/40 border border-[#3F3F46] text-white text-xs font-medium">
            ${qty} <span class="font-normal">${unit || 'ชิ้น'}</span>
        </span>
    `;

    // ป้ายสถานะ "กำลังโอน" — จุดสี + tint 12% ตามตารางสถานะในข้อ 11.6
    // ต้องมี <div> บล็อกครอบอีกชั้น ไม่งั้นป้าย inline-flex จะไปเบียดอยู่บรรทัดเดียวกับตัวเลขจำนวน
    const transferBadge = () => `
        <div class="mt-1.5">
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-orange-500/[0.12]">
                <div class="w-2 h-2 rounded-full bg-orange-500"></div>
                <span class="text-orange-400 font-medium text-xs">กำลังโอน</span>
            </div>
        </div>
    `;

    const imeiList = (imeis) => {
        if (!imeis || !imeis.length) return '';
        const tags = imeis.map(i =>
            `<span class="font-mono text-[10px] text-white/70 bg-[#27272A] border border-[#3F3F46] px-1.5 py-0.5 rounded-[0.375rem]">${i}</span>`
        ).join('');
        return `<div class="flex flex-wrap items-center gap-1 mt-1.5"><span class="text-[10px] text-white/70">IMEI:</span>${tags}</div>`;
    };

    // ผูกพฤติกรรมกาง/ยุบให้แถวระดับ 1 (กางลูกระดับ 2 และยุบทั้งสาขาเมื่อปิด)
    const bindLevel1Toggle = (nameRowId) => {
        const btn = document.getElementById(`btn-${nameRowId}`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const icon = document.getElementById(`icon-${nameRowId}`);
            const isExpanded = icon.classList.contains('fa-chevron-down');

            if (isExpanded) {
                icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                btn.setAttribute('aria-expanded', 'false');
                document.querySelectorAll(`.child-of-${nameRowId}`).forEach(c => c.classList.add('hidden'));
                document.querySelectorAll(`.level2-icon-of-${nameRowId}`).forEach(i => {
                    i.classList.replace('fa-chevron-down', 'fa-chevron-right');
                    const childBtn = i.closest('button[aria-expanded]');
                    if (childBtn) childBtn.setAttribute('aria-expanded', 'false');
                });
            } else {
                icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                btn.setAttribute('aria-expanded', 'true');
                // กางแค่ระดับ 2 เท่านั้น ระดับ 3 ยังยุบอยู่จนกว่าจะกดระดับ 2
                document.querySelectorAll(`.level2-of-${nameRowId}`).forEach(c => c.classList.remove('hidden'));
            }
        });
    };

    // ผูกพฤติกรรมกาง/ยุบให้แถวระดับ 2
    const bindLevel2Toggle = (rowId) => {
        const btn = document.getElementById(`btn-${rowId}`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const icon = document.getElementById(`icon-${rowId}`);
            const isExpanded = icon.classList.contains('fa-chevron-down');
            const children = document.querySelectorAll(`.child-of-${rowId}`);

            if (isExpanded) {
                icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                btn.setAttribute('aria-expanded', 'false');
                children.forEach(c => c.classList.add('hidden'));
            } else {
                icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                btn.setAttribute('aria-expanded', 'true');
                children.forEach(c => c.classList.remove('hidden'));
            }
        });
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

            // แท็บที่เลือกอยู่ = ปุ่มทึบเหลืองปุ่มเดียวของหน้า ที่เหลือเป็นพิลล์ขอบเทาตามข้อ 11.9
            const TAB_ACTIVE = ['bg-[#FFE169]', 'text-[#333333]', 'border-[#FFE169]'];
            const TAB_IDLE = ['bg-[#27272A]', 'text-slate-300', 'border-[#3F3F46]', 'hover:border-[#FFE169]', 'hover:text-white'];

            const activateTab = (activeTab, inactiveTab, activeContent, inactiveContent) => {
                activeTab.classList.remove(...TAB_IDLE);
                activeTab.classList.add(...TAB_ACTIVE);
                activeTab.setAttribute('aria-pressed', 'true');

                inactiveTab.classList.remove(...TAB_ACTIVE);
                inactiveTab.classList.add(...TAB_IDLE);
                inactiveTab.setAttribute('aria-pressed', 'false');

                activeContent.classList.remove('hidden');
                inactiveContent.classList.add('hidden');
            };

            if (tabMyStock && tabGlobalStock) {
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
                filter.innerHTML = '<option value="ALL">ประเภททั้งหมด</option>'
                    + md.productTypes.map(type => `<option value="${type.name}">${type.name}</option>`).join('');
            };
            populateTypeFilter('filter-branch-mystock-type');
            populateTypeFilter('filter-branch-globalstock-type');

            Object.keys(TABS).forEach(key => {
                const t = TABS[key];
                document.getElementById(t.type)?.addEventListener('change', t.reload);
                document.getElementById(t.condition)?.addEventListener('change', t.reload);
                document.getElementById(t.search)?.addEventListener('input', () => applySearch(key));
            });

            isBranchInventoryInitialized = true;
        }

        window.loadBranchInventoryMyStock();
    };

    // ==========================================
    // แท็บ 1: สต็อกในสาขาของฉัน — จัดกลุ่ม ชื่อสินค้า > สี > รายการ
    // ==========================================

    window.loadBranchInventoryMyStock = async () => {
        const tbody = document.getElementById('table-body-branch-mystock');
        if (!tbody) return;

        totalGroups.mystock = 0;
        updateCount('mystock');
        renderChips('mystock');
        renderSkeleton(tbody);

        try {
            const res = await authFetch(`${API_BASE_URL}/products`); // endpoint ปกติ = สาขาของผู้ใช้เอง
            const data = await res.json();
            if (!data.success) return;

            tbody.innerHTML = '';
            const baseItems = data.data.filter(p => Number(p.quantity || 0) > 0);
            // ตัวหารของตัวนับ = จำนวนกลุ่มสินค้าทั้งหมดก่อนกรองประเภท/สภาพ
            totalGroups.mystock = new Set(baseItems.map(p => p.name || 'ไม่ระบุชื่อ')).size;

            let items = baseItems;

            const typeFilter = document.getElementById('filter-branch-mystock-type')?.value || 'ALL';
            if (typeFilter !== 'ALL') {
                items = items.filter(p => (p.type_id ? p.type_id.name : '') === typeFilter);
            }

            const condFilter = document.getElementById('filter-branch-mystock-condition')?.value || 'ALL';
            if (condFilter !== 'ALL') {
                items = items.filter(p => {
                    const condName = p.condition_id ? p.condition_id.name : '';
                    return condName.replace(/\s+/g, '') === condFilter.replace(/\s+/g, '');
                });
            }

            if (items.length === 0) {
                tbody.innerHTML = stateRow('ไม่พบสินค้าคงเหลือในสาขาของคุณ');
                renderChips('mystock');
                updateCount('mystock');
                return;
            }

            const groupedData = {};
            items.forEach(p => {
                const imeiCount = (p.imeis && p.imeis.length) ? p.imeis.length : 0;
                const qty = imeiCount > 0 ? imeiCount : (p.quantity || 0);
                if (qty <= 0) return;

                const name = p.name || 'ไม่ระบุชื่อ';
                const color = (p.color_id && p.color_id.name) ? p.color_id.name : 'ไม่ระบุสี';
                const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';

                if (!groupedData[name]) groupedData[name] = { total: 0, colors: {}, unit };
                groupedData[name].total += qty;
                groupedData[name].unit = unit;

                // เก็บ doc ของสีไว้ด้วย เพื่อให้วงกลมสีอ่าน color_code ที่แอดมินตั้งเองได้ ไม่ใช่เดาจากชื่ออย่างเดียว
                if (!groupedData[name].colors[color]) groupedData[name].colors[color] = { total: 0, items: [], unit, colorDoc: p.color_id || null };
                groupedData[name].colors[color].total += qty;
                groupedData[name].colors[color].unit = unit;
                groupedData[name].colors[color].items.push({ ...p, qtyToDisplay: qty, unit });
            });

            let nameIndex = 0;
            for (const [name, nameGroup] of Object.entries(groupedData)) {
                nameIndex++;
                const nameRowId = `mystock-group-${nameIndex}`;

                // ระดับ 1 — ชื่อสินค้า
                const trName = document.createElement('tr');
                trName.className = `name-row ${nameRowId} ${ROW_BASE}`;
                trName.innerHTML = `
                    <td class="px-6 py-4">
                        ${disclosureButton(nameRowId, '', '', `<span class="font-semibold text-white text-[15px]">${name}</span>`)}
                    </td>
                    <td class="px-6 py-4 text-center">${groupQtyBadge(nameGroup.total, nameGroup.unit)}</td>
                    <td class="px-6 py-4"></td>
                `;
                tbody.appendChild(trName);
                bindLevel1Toggle(nameRowId);

                let colorIndex = 0;
                for (const [color, colorGroup] of Object.entries(nameGroup.colors)) {
                    colorIndex++;
                    const colorRowId = `${nameRowId}-color-${colorIndex}`;

                    // ระดับ 2 — สี
                    const trColor = document.createElement('tr');
                    trColor.className = `level2-row ${colorRowId} hidden child-of-${nameRowId} level2-of-${nameRowId} ${ROW_BASE}`;
                    trColor.innerHTML = `
                        <td class="px-6 py-4">
                            ${disclosureButton(
                                colorRowId,
                                'ml-6',
                                `text-xs level2-icon-of-${nameRowId}`,
                                `${colorDot(color, colorGroup.colorDoc)}<span class="text-sm text-white/70">สี: <span class="font-medium text-white">${color}</span></span>`
                            )}
                        </td>
                        <td class="px-6 py-4 text-center text-white/70 font-medium">
                            ${colorGroup.total} <span class="text-xs font-normal">${colorGroup.unit || 'ชิ้น'}</span>
                        </td>
                        <td class="px-6 py-4"></td>
                    `;
                    tbody.appendChild(trColor);
                    bindLevel2Toggle(colorRowId);

                    // ระดับ 3 — รายการสินค้า
                    colorGroup.items.forEach(p => {
                        const capacity = (p.capacity_id && p.capacity_id.name) ? p.capacity_id.name : 'ไม่ระบุความจุ';
                        const condition = (p.condition_id && p.condition_id.name) ? p.condition_id.name : '';

                        const trItem = document.createElement('tr');
                        trItem.className = `item-row hidden child-of-${nameRowId} child-of-${colorRowId} ${ROW_BASE}`;
                        trItem.innerHTML = `
                            <td class="px-6 py-4">
                                <div class="flex flex-col gap-1 ml-12">
                                    <span class="text-sm text-white/70">
                                        ความจุ: <span class="font-medium text-white">${capacity}</span>${condition ? ` / <span class="font-medium text-white">${condition}</span>` : ''}
                                    </span>
                                    <span class="font-mono text-xs font-semibold text-[#FFE169]">${p.product_code || '-'}</span>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-center text-white font-medium">
                                ${p.qtyToDisplay} <span class="text-xs font-normal">${p.unit || 'ชิ้น'}</span>
                                ${p.is_transferring ? transferBadge() : ''}
                            </td>
                            <td class="px-6 py-4 text-right text-white font-mono">฿${(p.selling_price || 0).toLocaleString()}</td>
                        `;
                        tbody.appendChild(trItem);
                    });
                }
            }

            // คำค้นที่ค้างอยู่ต้องถูกใช้ซ้ำกับแถวชุดใหม่ ไม่งั้นชิป "ค้นหา: ..." จะโชว์อยู่แต่ตารางไม่ได้กรอง
            applySearch('mystock');
        } catch (err) {
            console.error(err);
            totalGroups.mystock = 0;
            tbody.innerHTML = stateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
            updateCount('mystock');
        }
    };

    // ==========================================
    // แท็บ 2: สต็อกและราคาอ้างอิงทุกสาขา — จัดกลุ่ม ชื่อสินค้า > สาขา > รายการ
    // ==========================================

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

            tbody.innerHTML = '';
            const baseItems = data.data.filter(p => Number(p.global_total_quantity || 0) > 0);
            totalGroups.globalstock = new Set(baseItems.map(p => p.name || 'ไม่ระบุชื่อ')).size;

            let items = baseItems;

            const typeFilter = document.getElementById('filter-branch-globalstock-type')?.value || 'ALL';
            if (typeFilter !== 'ALL') {
                items = items.filter(p => (p.type_id ? p.type_id.name : '') === typeFilter);
            }

            const condFilter = document.getElementById('filter-branch-globalstock-condition')?.value || 'ALL';
            if (condFilter !== 'ALL') {
                items = items.filter(p => {
                    const condName = p.condition_id ? p.condition_id.name : '';
                    return condName.replace(/\s+/g, '') === condFilter.replace(/\s+/g, '');
                });
            }

            if (items.length === 0) {
                tbody.innerHTML = stateRow('ไม่พบข้อมูลสินค้าในระบบ');
                renderChips('globalstock');
                updateCount('globalstock');
                return;
            }

            const groupedData = {};
            items.forEach(p => {
                const name = p.name || 'ไม่ระบุชื่อ';
                const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';
                if (!groupedData[name]) groupedData[name] = { total: 0, branches: {}, unit };
                groupedData[name].unit = unit;

                if (p.stock_balances && p.stock_balances.length > 0) {
                    p.stock_balances.forEach(b => {
                        const bQty = (b.imeis && b.imeis.length > 0) ? b.imeis.length : (b.quantity || 0);
                        if (bQty <= 0) return;

                        groupedData[name].total += bQty;
                        const bName = b.branch_id ? (b.branch_id.name || 'ไม่ทราบสาขา') : 'ไม่ทราบสาขา';
                        if (!groupedData[name].branches[bName]) groupedData[name].branches[bName] = { total: 0, items: [], unit };
                        groupedData[name].branches[bName].total += bQty;
                        groupedData[name].branches[bName].unit = unit;
                        groupedData[name].branches[bName].items.push({
                            ...p,
                            qtyToDisplay: bQty,
                            branchImeis: b.imeis || [],
                            unit,
                        });
                    });
                }
            });

            let nameIndex = 0;
            for (const [name, nameGroup] of Object.entries(groupedData)) {
                if (nameGroup.total <= 0) continue;

                nameIndex++;
                const nameRowId = `globalstock-group-${nameIndex}`;

                // ระดับ 1 — ชื่อสินค้า
                const trName = document.createElement('tr');
                trName.className = `name-row ${nameRowId} ${ROW_BASE}`;
                trName.innerHTML = `
                    <td class="px-6 py-4">
                        ${disclosureButton(nameRowId, '', '', `<span class="font-semibold text-white text-[15px]">${name}</span>`)}
                    </td>
                    <td class="px-6 py-4 text-center">${groupQtyBadge(nameGroup.total, nameGroup.unit)}</td>
                    <td class="px-6 py-4"></td>
                `;
                tbody.appendChild(trName);
                bindLevel1Toggle(nameRowId);

                let branchIndex = 0;
                for (const [branchName, branchGroup] of Object.entries(nameGroup.branches)) {
                    branchIndex++;
                    const branchRowId = `${nameRowId}-branch-${branchIndex}`;

                    // ระดับ 2 — สาขา
                    const trBranch = document.createElement('tr');
                    trBranch.className = `level2-row ${branchRowId} hidden child-of-${nameRowId} level2-of-${nameRowId} ${ROW_BASE}`;
                    trBranch.innerHTML = `
                        <td class="px-6 py-4">
                            ${disclosureButton(
                                branchRowId,
                                'ml-6',
                                `text-xs level2-icon-of-${nameRowId}`,
                                `<span class="text-sm text-white/70 flex items-center gap-1.5">
                                    <i class="fa-solid fa-store text-white/70"></i>
                                    สาขา: <span class="font-medium text-white">${branchName}</span>
                                 </span>`
                            )}
                        </td>
                        <td class="px-6 py-4 text-center text-white/70 font-medium">
                            ${branchGroup.total} <span class="text-xs font-normal">${branchGroup.unit || 'ชิ้น'}</span>
                        </td>
                        <td class="px-6 py-4"></td>
                    `;
                    tbody.appendChild(trBranch);
                    bindLevel2Toggle(branchRowId);

                    // ระดับ 3 — รายการสินค้า
                    branchGroup.items.forEach(p => {
                        const capacity = (p.capacity_id && p.capacity_id.name) ? p.capacity_id.name : 'ไม่ระบุความจุ';
                        const color = (p.color_id && p.color_id.name) ? p.color_id.name : 'ไม่ระบุสี';
                        const condition = (p.condition_id && p.condition_id.name) ? p.condition_id.name : '';

                        const trItem = document.createElement('tr');
                        trItem.className = `item-row hidden child-of-${nameRowId} child-of-${branchRowId} ${ROW_BASE}`;
                        trItem.innerHTML = `
                            <td class="px-6 py-4">
                                <div class="flex flex-col gap-1 ml-12">
                                    <span class="text-sm text-white/70 flex items-center gap-2">
                                        ${colorDot(color, p.color_id)}
                                        <span>สี: <span class="font-medium text-white">${color}</span>
                                        / ความจุ: <span class="font-medium text-white">${capacity}</span>${condition ? ` / <span class="font-medium text-white">${condition}</span>` : ''}</span>
                                    </span>
                                    <span class="font-mono text-xs font-semibold text-[#FFE169]">${p.product_code || '-'}</span>
                                    ${imeiList(p.branchImeis)}
                                </div>
                            </td>
                            <td class="px-6 py-4 text-center text-white font-medium">
                                ${p.qtyToDisplay} <span class="text-xs font-normal">${p.unit || 'ชิ้น'}</span>
                            </td>
                            <td class="px-6 py-4 text-right text-white font-mono">฿${(p.selling_price || 0).toLocaleString()}</td>
                        `;
                        tbody.appendChild(trItem);
                    });
                }
            }

            applySearch('globalstock');
        } catch (err) {
            console.error(err);
            totalGroups.globalstock = 0;
            tbody.innerHTML = stateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
            updateCount('globalstock');
        }
    };

})();
