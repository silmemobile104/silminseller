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
            html += `<tr>${cells.map(c => `<td class="px-6 py-4">${c}</td>`).join('')}</tr>`;
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

        // ตัวกรองจากลิ้นชัก "เพิ่มเติม"
        const a = adv[key];
        const range = (min, max) => `${min !== '' ? Number(min).toLocaleString() : '0'} - ${max !== '' ? Number(max).toLocaleString() : 'ไม่จำกัด'}`;
        const advChip = (label, clear) => { activeCount++; addChip(label, () => { clear(); t.reload(); }); };
        if (a.kind) advChip(`ชนิด: ${a.kind === 'device' ? 'เครื่อง' : 'อุปกรณ์เสริม'}`, () => { a.kind = ''; });
        if (a.model) advChip(`รุ่น: ${a.model}`, () => { a.model = ''; });
        if (a.name) advChip(`ชื่อ: ${a.name}`, () => { a.name = ''; });
        if (a.color) advChip(`สี: ${a.color}`, () => { a.color = ''; });
        if (a.capacity) advChip(`ความจุ: ${a.capacity}`, () => { a.capacity = ''; });
        if (a.priceMin !== '' || a.priceMax !== '') advChip(`ราคาขาย: ฿${range(a.priceMin, a.priceMax)}`, () => { a.priceMin = ''; a.priceMax = ''; });
        if (a.qtyMin !== '' || a.qtyMax !== '') advChip(`จำนวนคงเหลือ: ${range(a.qtyMin, a.qtyMax)}`, () => { a.qtyMin = ''; a.qtyMax = ''; });
        updateAdvBadge(key);

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
                adv[key] = emptyAdv();
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
        tr.className = 'group-row hidden'; // ซ่อนแถวหัวกลุ่ม แต่ยังเก็บไว้ใช้จัดลำดับ เรียง และนับในชื่อการ์ด
        tr.dataset.label = g.label;
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
        const parts = []; // ต่อท้ายชื่อการ์ด เช่น "(เครื่อง 1130 รายการ · อุปกรณ์เสริม 7 รายการ)"
        const closeGroup = () => {
            if (!header) return;
            header.style.display = n ? '' : 'none';
            const c = header.querySelector('.group-count');
            if (c) c.textContent = `${n} รายการ`;
            if (n) parts.push(`${header.dataset.label || ''} ${n.toLocaleString('th-TH')} รายการ`);
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
        const sum = document.getElementById(`summary-branch-${key}`);
        if (sum) sum.textContent = parts.length ? `(${parts.join(' · ')})` : '';
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
        '<td class="idx-cell px-6 py-4 text-center text-body-muted font-mono"></td>';

    const codeCell = (p) =>
        `<td class="px-6 py-4"><span class="font-mono text-md font-semibold text-accent-ink">${esc(p.product_code || '-')}</span></td>`;

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
            <td class="px-6 py-4 w-full">
                <p class="font-medium text-ink flex items-center gap-2">
                    ${colorDot(color, p.color_id)}<span>${esc(p.name || 'ไม่ระบุชื่อ')}</span>
                    ${sub ? `<span class="text-sm font-normal text-ink/70">${esc(sub)}</span>` : ''}
                    ${cat ? `<span class="px-2 py-0.5 bg-field text-body-muted rounded-[0.375rem] text-xs font-normal">${esc(cat)}</span>` : ''}
                    ${transferBadge}
                </p>
            </td>`;
    };

    const priceCell = (p) =>
        `<td class="px-6 py-4 text-right text-ink font-mono">฿${(Number(p.selling_price) || 0).toLocaleString()}</td>`;

    const qtyCell = (qty, unit) =>
        `<td class="px-6 py-4 text-center text-ink font-medium">${qty} <span class="text-xs text-ink font-normal">${esc(unit || 'ชิ้น')}</span></td>`;

    const buildRow = (cells, searchText, p, qty, extra = {}) => {
        const tr = document.createElement('tr');
        // ข้อมูลดิบของแถว ไว้ให้ปุ่มส่งออกใช้ (ไม่ต้องไปแกะจาก HTML)
        const g = GROUPS.find(x => x.kind === kindOf(p));
        tr._rec = { p, qty, group: g ? g.label : '', imeis: extra.imeis || p.imeis || [], branch: extra.branch || '' };
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
    // ตัวกรองเพิ่มเติม (ลิ้นชัก "เพิ่มเติม" เหมือน #stock) + ส่งออกเป็นตาราง
    // ==========================================

    const emptyAdv = () => ({ kind: '', model: '', name: '', color: '', capacity: '', priceMin: '', priceMax: '', qtyMin: '', qtyMax: '' });
    const adv = { mystock: emptyAdv(), globalstock: emptyAdv() };
    const modelNames = { mystock: [], globalstock: [] }; // รุ่นที่มีของจริง ไว้เติมตัวเลือก "รุ่น"
    let advKey = 'mystock'; // แท็บที่ลิ้นชักกำลังแก้ไขอยู่

    const advCount = (key) => {
        const a = adv[key];
        let n = 0;
        const t = TABS[key];
        [t.type, t.condition, t.branch].forEach(id => { const el = id && document.getElementById(id); if (el && el.value !== 'ALL') n++; });
        if (a.kind) n++;
        if (a.model) n++;
        if (a.name) n++;
        if (a.color) n++;
        if (a.capacity) n++;
        if (a.priceMin !== '' || a.priceMax !== '') n++;
        if (a.qtyMin !== '' || a.qtyMax !== '') n++;
        return n;
    };

    const updateAdvBadge = (key) => {
        const el = document.getElementById(`btn-branch-adv-text-${key}`);
        if (!el) return;
        const n = advCount(key);
        el.textContent = n > 0 ? `กรอง (${n})` : 'กรอง';
    };

    // กรองด้วยค่าจากลิ้นชัก — qty คือจำนวนที่ตารางแสดงจริงของแถวนั้น (แท็บ 2 คือจำนวนของสาขานั้น)
    const matchesAdv = (p, qty, key) => {
        const a = adv[key];
        if (a.kind && kindOf(p) !== a.kind) return false;
        if (a.model && String(p.name || '') !== a.model) return false;
        if (a.name && !String(p.name || '').toLowerCase().includes(a.name.toLowerCase())) return false;
        if (a.color && (p.color_id ? p.color_id.name : '') !== a.color) return false;
        if (a.capacity && (p.capacity_id ? p.capacity_id.name : '') !== a.capacity) return false;
        const price = Number(p.selling_price) || 0;
        if (a.priceMin !== '' && price < Number(a.priceMin)) return false;
        if (a.priceMax !== '' && price > Number(a.priceMax)) return false;
        if (a.qtyMin !== '' && qty < Number(a.qtyMin)) return false;
        if (a.qtyMax !== '' && qty > Number(a.qtyMax)) return false;
        return true;
    };

    const advPanel = () => document.getElementById('branch-adv-panel');
    const advContent = () => document.getElementById('branch-adv-panel-content');

    // ชิปแบบเลือกได้ค่าเดียว (ค่าว่าง = ทั้งหมด) — สไตล์เดียวกับ filter-pill ในลิ้นชัก #stock
    const PILL_ON = 'ring-1 ring-accent-ink text-accent-ink';
    const PILL_OFF = 'text-body-muted hover:ring-1 hover:ring-accent-ink hover:text-ink';
    const renderAdvPills = (containerId, items, current, kind) => {
        const box = document.getElementById(containerId);
        if (!box) return;
        const all = [{ value: '', label: 'ทั้งหมด' }, ...items];
        box.innerHTML = all.map(it => {
            const on = it.value === current;
            const swatch = kind === 'color' && it.value
                ? `<span class="w-4 h-4 rounded-full shrink-0 border border-gray-400" style="background-color:${esc(it.hex)}"></span>` : '';
            return `<button type="button" data-value="${esc(it.value)}" aria-pressed="${on}"
                class="flex-shrink-0 px-4 py-2.5 bg-field rounded-xl text-sm transition-colors flex items-center gap-2 cursor-pointer ${on ? PILL_ON : PILL_OFF}">${swatch}${esc(it.label)}</button>`;
        }).join('');
    };

    // อ่านค่าที่เลือกในกลุ่มชิป — ใช้ aria-pressed เป็นตัวเก็บสถานะ
    const pickedValue = (containerId) => {
        const on = document.querySelector(`#${containerId} button[aria-pressed="true"]`);
        return on ? on.dataset.value : '';
    };

    const fillAdvPanel = (key) => {
        const a = adv[key];
        const md = window.masterDataCache || {};
        const colors = (md.productColors || []).map(c => ({
            value: c.name, label: c.name,
            hex: window.productColorHex ? window.productColorHex(c.name, c) : '#888888',
        }));
        const caps = (md.productCapacities || []).map(c => ({ value: c.name, label: c.name }));
        // ชนิด / กลุ่มสินค้า / สภาพ / ที่จัดเก็บ — ค่าจริงเก็บอยู่ใน <select> ของแท็บ (ซ่อนไว้ในแถบควบคุม)
        const t = TABS[key];
        const fromSelect = (id) => {
            const el = id && document.getElementById(id);
            if (!el) return { items: [], cur: '' };
            return {
                items: Array.from(el.options).filter(o => o.value !== 'ALL').map(o => ({ value: o.value, label: o.textContent.replace(/^[^:]+:\s*/, '') })),
                cur: el.value === 'ALL' ? '' : el.value,
            };
        };
        renderAdvPills('branch-adv-kind', GROUPS.map(g => ({ value: g.kind, label: g.label })), a.kind, 'kind');
        const typeSel = document.getElementById(t.type);
        const types = (window.masterDataCache && window.masterDataCache.productTypes) || [];
        if (typeSel && typeSel.options.length <= 1 && types.length) {
            typeSel.innerHTML = '<option value="ALL">ประเภท: ทั้งหมด</option>' + types.map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');
        }
        const ty = fromSelect(t.type), co = fromSelect(t.condition), br = fromSelect(t.branch);
        renderAdvPills('branch-adv-type', ty.items, ty.cur, 'type');
        renderAdvPills('branch-adv-cond', co.items, co.cur, 'cond');
        const brEl = document.getElementById('branch-adv-branch');
        brEl.innerHTML = '<option value="">ทุกที่จัดเก็บ</option>' + br.items.map(i => `<option value="${esc(i.value)}">${esc(i.label)}</option>`).join('');
        brEl.value = br.cur;
        document.getElementById('branch-adv-branch-wrap')?.classList.toggle('hidden', !t.branch);
        renderAdvPills('branch-adv-color', colors, a.color, 'color');
        renderAdvPills('branch-adv-capacity', caps, a.capacity, 'capacity');
        const modelEl = document.getElementById('branch-adv-model');
        const names = (!a.model || modelNames[key].includes(a.model)) ? modelNames[key] : [a.model, ...modelNames[key]];
        modelEl.innerHTML = '<option value="">ทุกรุ่น</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        modelEl.value = a.model;
        document.getElementById('branch-adv-name').value = a.name;
        document.getElementById('branch-adv-price-min').value = a.priceMin;
        document.getElementById('branch-adv-price-max').value = a.priceMax;
        document.getElementById('branch-adv-qty-min').value = a.qtyMin;
        document.getElementById('branch-adv-qty-max').value = a.qtyMax;
        const s = sortState[key];
        document.getElementById('branch-adv-sort').value = s && ['price', 'qty'].includes(s.by) ? `${s.by}:${s.dir}` : '';
    };

    const openAdvPanel = (key) => {
        advKey = key;
        fillAdvPanel(key);
        const panel = advPanel();
        if (!panel) return;
        panel.classList.remove('opacity-0', 'pointer-events-none');
        advContent()?.classList.remove('translate-x-full');
        advContent()?.focus();
    };

    const closeAdvPanel = () => {
        advPanel()?.classList.add('opacity-0', 'pointer-events-none');
        advContent()?.classList.add('translate-x-full');
    };

    const applyAdvPanel = () => {
        const val = (id) => document.getElementById(id).value.trim();
        const t = TABS[advKey];
        const setSel = (id, v) => { const el = id && document.getElementById(id); if (el) el.value = v || 'ALL'; };
        setSel(t.type, pickedValue('branch-adv-type'));
        setSel(t.condition, pickedValue('branch-adv-cond'));
        setSel(t.branch, document.getElementById('branch-adv-branch').value);
        adv[advKey] = {
            kind: pickedValue('branch-adv-kind'),
            model: document.getElementById('branch-adv-model').value,
            name: val('branch-adv-name'),
            color: pickedValue('branch-adv-color'),
            capacity: pickedValue('branch-adv-capacity'),
            priceMin: val('branch-adv-price-min'),
            priceMax: val('branch-adv-price-max'),
            qtyMin: val('branch-adv-qty-min'),
            qtyMax: val('branch-adv-qty-max'),
        };
        const [by, dir] = (document.getElementById('branch-adv-sort').value || '').split(':');
        sortState[advKey] = by ? { by, dir: Number(dir) } : null;
        closeAdvPanel();
        TABS[advKey].reload();
    };

    const resetAdv = (key) => {
        [TABS[key].type, TABS[key].condition, TABS[key].branch].forEach(id => { const el = id && document.getElementById(id); if (el) el.value = 'ALL'; });
        adv[key] = emptyAdv();
        sortState[key] = null;
    };

    // ส่งออกเฉพาะแถวที่มองเห็นอยู่ (หลังกรอง + ค้นหา) ตามลำดับที่เห็นบนจอ เป็นไฟล์ .xlsx
    const exportTable = async (key, format = 'xlsx') => {
        const tbody = document.getElementById(TABS[key].tbody);
        const rows = tbody ? Array.from(tbody.querySelectorAll('tr.item-row')).filter(r => r.style.display !== 'none' && r._rec) : [];
        if (rows.length === 0) {
            if (typeof showToast === 'function') showToast('ไม่มีข้อมูลให้ส่งออก', 'error');
            return;
        }
        const isGlobal = key === 'globalstock';
        const header = ['ลำดับ', 'กลุ่ม', 'รหัสสินค้า', 'ชื่อสินค้า', 'ประเภท', 'ความจุ', 'สี', 'สภาพ',
            ...(isGlobal ? ['ที่จัดเก็บ'] : []), 'ราคาขาย', 'คงเหลือ', 'หน่วย', 'IMEI'];
        let n = 0, lastGroup = '';
        const data = rows.map(tr => {
            const r = tr._rec;
            const p = r.p;
            if (r.group !== lastGroup) { n = 0; lastGroup = r.group; }
            n++;
            return [n, r.group, p.product_code || '', p.name || '',
                p.type_id ? p.type_id.name : '', p.capacity_id ? p.capacity_id.name : '',
                p.color_id ? p.color_id.name : '', p.condition_id ? p.condition_id.name : '',
                ...(isGlobal ? [r.branch] : []),
                Number(p.selling_price) || 0, r.qty, (p.unit_id && p.unit_id.name) || 'ชิ้น', (r.imeis || []).join(', ')];
        });
        const stamp = new Date().toISOString().slice(0, 10);
        if (format === 'pdf') {
            // PDF: เปิดหน้าพิมพ์ให้เลือก "บันทึกเป็น PDF" — ใช้ฟอนต์ไทยของระบบ ไม่ต้องฝังฟอนต์เอง
            const title = isGlobal ? 'สินค้าและราคาสาขาอื่น' : 'สินค้าในสาขาของฉัน';
            const num = new Set(['ลำดับ', 'ราคาขาย', 'คงเหลือ']);
            const w = window.open('', '_blank');
            if (!w) { if (typeof showToast === 'function') showToast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัป', 'error'); return; }
            const th = header.map(h => `<th class="${num.has(h) ? 'r' : ''}">${esc(h)}</th>`).join('');
            const tr = data.map(d => `<tr>${d.map((v, i) => `<td class="${num.has(header[i]) ? 'r' : ''}">${esc(num.has(header[i]) && typeof v === 'number' ? v.toLocaleString('th-TH') : v)}</td>`).join('')}</tr>`).join('');
            w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}_${stamp}</title>
<link rel="stylesheet" href="${location.origin}/vendor/fonts/fonts.css?v=2">
<style>@page{size:A4 landscape;margin:10mm}body{font-family:'Sarabun','Prompt',sans-serif;color:#111;font-size:11px}
h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#555}table{width:100%;border-collapse:collapse}
th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eee}thead{display:table-header-group}tr{page-break-inside:avoid}.r{text-align:right}</style></head>
<body><h1>${esc(title)}</h1><p>วันที่ ${esc(new Date().toLocaleDateString('th-TH'))} · ${data.length} รายการ</p>
<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`);
            w.document.close();
            const go = () => { w.focus(); w.print(); };
            (w.document.fonts && w.document.fonts.ready ? w.document.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 300));
            return;
        }
        const fileName = `${isGlobal ? 'สต็อกทุกสาขา' : 'สินค้าในสาขาของฉัน'}_${stamp}.xlsx`;
        try {
            await window.ensureXlsxLoaded();
            const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
            ws['!cols'] = header.map((h, i) => ({ wch: Math.min(40, Math.max(h.length + 2, ...data.map(d => String(d[i] ?? '').length + 2))) }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'สต็อก');
            XLSX.writeFile(wb, fileName);
            if (typeof showToast === 'function') showToast(`ส่งออก ${data.length} รายการเรียบร้อย`, 'success');
        } catch (err) {
            console.error(err);
            if (typeof showToast === 'function') showToast('ส่งออกไม่สำเร็จ กรุณาลองใหม่', 'error');
        }
    };

    // ==========================================
    // แท็บ 3: แดชบอร์ดสต็อก — ตามแบบ "แดชบอร์ดสต็อก-html" (ภาพรวม → เครื่อง → อุปกรณ์เสริม/สต็อกต่ำ → สาขา/การเคลื่อนย้าย)
    // วาดด้วย HTML/CSS ล้วน สไตล์อยู่ใน <style> ของ views/branch-inventory.html (ขอบเขต .bd)
    // ไม่แสดงราคาต้นทุน
    // ==========================================

    const dash = { scope: 'mine', seq: 0 };
    const fmt = (n) => Number(n || 0).toLocaleString('en-US');
    const baht = (n) => `฿${Math.round(n || 0).toLocaleString('en-US')}`;
    const LOW_DEVICE = 3, LOW_ACCESSORY = 5; // เหลือไม่เกินเท่านี้ = ใกล้หมด
    const pc = (v, t) => { const p = t ? v / t * 100 : 0; return p < 1 && v > 0 ? '<1%' : `${Math.round(p)}%`; };
    const wd = (v, m) => `${Math.max(1.5, m ? v / m * 100 : 0).toFixed(1)}%`;
    const ht = (v, m, px) => Math.max(4, Math.round(m ? v / m * px : 0));
    const thDate = (d) => { const x = new Date(d); return isNaN(x) ? '-' : x.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }); };

    // ดึงข้อมูล: rows = (สินค้า × สาขา) ที่มีของ · products = สินค้าทั้งหมดที่ API ส่งมา (ไว้หาสินค้าหมด)
    // สาขาของผู้ใช้ — แอดมิน/ผู้จัดการเรียก /products เฉยๆ จะได้ "ทุกสาขา" ต้องระบุ branch_id เอง
    const myBranchId = () => {
        try {
            const u = JSON.parse(localStorage.getItem('silmin_user') || '{}');
            const b = u.branch_id || u.branch;
            return b ? String(b._id || b) : '';
        } catch (e) { return ''; }
    };
    const myProductsUrl = () => {
        const id = myBranchId();
        return id ? `${API_BASE_URL}/products?branch_id=${encodeURIComponent(id)}` : `${API_BASE_URL}/products`;
    };

    // ทุกส่วนของแดชบอร์ดนับ "ต่อสาขา" ด้วยกติกาเดียวกันทั้งสองขอบเขต
    // ทุกสาขา = ผลรวมของทุกสาขา → ตัวเลขของสาขาใดสาขาหนึ่งต้องไม่มากกว่าทุกสาขาเสมอ
    //   rows      = (สินค้า × สาขา) ที่มีของ
    //   outRows   = (สินค้า × สาขา) ที่สาขานั้นมีรายการสต็อกแต่เหลือ 0
    //   transfers = สินค้าที่กำลังโอน (แถวสังเคราะห์ is_transferring จาก /products)
    const dashData = async (scope) => {
        const getJson = async (url) => {
            const res = await authFetch(url);
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'load failed');
            return data.data || [];
        };
        if (scope === 'all') {
            // /products ไม่ระบุสาขา: แอดมินได้รายการโอนของทุกสาขา พนักงานทั่วไปได้เฉพาะที่เข้าสาขาตัวเอง
            const [products, live] = await Promise.all([
                getJson(`${API_BASE_URL}/products/global-stock`),
                getJson(`${API_BASE_URL}/products`).catch(() => []),
            ]);
            const outRows = [];
            products.forEach(p => (p.stock_balances || []).forEach(b => {
                if (!(Number(b.quantity) > 0)) outRows.push({ p, branch: b.branch_id ? (b.branch_id.name || 'ไม่ทราบสาขา') : 'ไม่ทราบสาขา' });
            }));
            return { rows: expandBranchRows(products), outRows, transfers: live.filter(p => p.is_transferring === true), products };
        }
        if (!myBranchId()) throw new Error('NO_BRANCH');
        const products = await getJson(myProductsUrl());
        const stockRows = products.filter(p => !p.is_transferring);
        const seen = new Set();
        const outRows = stockRows.filter(p => !(Number(p.quantity) > 0) && !seen.has(String(p._id)) && seen.add(String(p._id))).map(p => ({ p, branch: '' }));
        return {
            rows: stockRows.filter(p => Number(p.quantity || 0) > 0 && myQty(p) > 0).map(p => ({ p, qty: myQty(p), branch: '' })),
            outRows,
            transfers: products.filter(p => p.is_transferring === true),
            products,
        };
    };

    const nameOf = (m, k, fb) => (m && m[k] && m[k].name) || fb;
    const fullName = (p) => [p.name || 'ไม่ระบุชื่อ', nameOf(p, 'capacity_id', ''), nameOf(p, 'condition_id', '')].filter(Boolean).join(' · ');

    const summarize = (rows) => {
        const s = { pieces: 0, value: 0, models: new Map(), cond: new Map(), cap: new Map(), type: new Map(), color: new Map(), branch: new Map(), price: [0, 0, 0] };
        const bump = (m, k, q, extra) => { const e = m.get(k) || { qty: 0, ...extra }; e.qty += q; m.set(k, e); };
        rows.forEach(({ p, qty, branch }) => {
            const price = Number(p.selling_price) || 0;
            s.pieces += qty;
            s.value += qty * price;
            bump(s.models, p.name || 'ไม่ระบุชื่อ', qty);
            bump(s.cond, nameOf(p, 'condition_id', 'ไม่ระบุ'), qty);
            bump(s.cap, nameOf(p, 'capacity_id', 'ไม่ระบุ'), qty);
            bump(s.type, nameOf(p, 'type_id', 'ไม่ระบุ'), qty);
            bump(s.color, nameOf(p, 'color_id', 'ไม่ระบุ'), qty, { doc: p.color_id });
            if (branch) bump(s.branch, branch, qty);
            s.price[price < 10000 ? 0 : price <= 30000 ? 1 : 2] += qty;
        });
        return s;
    };
    const list = (m) => [...m.entries()].map(([label, e]) => ({ label, ...e }));
    const byQty = (a, b) => b.qty - a.qty || a.label.localeCompare(b.label, 'th');

    // ---- ชิ้นส่วน ----
    const barRow = (label, qty, max, total, cls, opts = {}) => `
        <div class="bar-row" ${opts.cols ? `style="grid-template-columns:${opts.cols}"` : ''}>
            <div class="bar-lbl"><span title="${esc(label)}">${esc(label)}</span></div>
            <div class="track"><div class="fill ${cls || ''}" style="width:${wd(qty, max)};${opts.bg ? `background:${opts.bg};box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)` : ''}"></div></div>
            <div class="num">${fmt(qty)}${total ? `<span class="pct">${pc(qty, total)}</span>` : ''}</div>
        </div>`;
    const barList = (items, total, clsFn, opts) => items.length
        ? `<div style="display:flex;flex-direction:column;gap:14px">${items.map((i, k, arr, maxQty = arr.maxQty || (arr.maxQty = Math.max(1, ...arr.map(x => x.qty)))) => barRow(i.label, i.qty, maxQty, total, clsFn(i, k), { ...opts, bg: opts && opts.bgFn ? opts.bgFn(i) : '' })).join('')}</div>`
        : `<p class="empty">ยังไม่มีข้อมูล</p>`;
    const colChart = (items) => {
        if (!items.length) return `<p class="empty">ยังไม่มีข้อมูล</p>`;
        const max = Math.max(...items.map(i => i.qty), 1);
        return `<div class="cols">${items.map(i => `
            <div class="col"><div class="col-v">${fmt(i.qty)}</div>
            <div class="col-b ${i.cls || ''}" style="height:${ht(i.qty, max, 130)}px;${i.color ? `background:${i.color}` : ''}"></div>
            <div class="col-l">${esc(i.label)}</div></div>`).join('')}</div>`;
    };
    // ไอคอนหน้าชื่อการ์ด / หัวข้อ (ใช้เฉพาะไอคอนที่อยู่ในชุดฟอนต์ที่ build ไว้แล้ว)
    const CARD_ICON = {
        'รุ่นที่มีมากที่สุด': 'fa-ranking-star', 'สภาพสินค้า': 'fa-star', 'ความจุ': 'fa-microchip', 'สี': 'fa-palette',
        'ช่วงราคา': 'fa-tag', 'กลุ่มสินค้า': 'fa-layer-group', 'อุปกรณ์เสริมที่มีมากที่สุด': 'fa-ranking-star',
        'สินค้าใกล้หมด': 'fa-triangle-exclamation', 'หมดสต็อก': 'fa-circle-xmark', 'เปรียบเทียบแต่ละสาขา': 'fa-store',
        'กำลังโอนย้าย': 'fa-truck-fast', 'เข้าใหม่ล่าสุด': 'fa-clock',
    };
    const SEC_ICON = { 'เครื่อง': 'fa-mobile-screen', 'อุปกรณ์เสริมและสต็อกต่ำ': 'fa-headphones', 'สาขาและการเคลื่อนย้าย': 'fa-store' };
    const CARD_TONE = { 'สินค้าใกล้หมด': 'var(--c)', 'หมดสต็อก': 'var(--mute)', 'กำลังโอนย้าย': 'var(--b)', 'เข้าใหม่ล่าสุด': 'var(--t)', 'เปรียบเทียบแต่ละสาขา': 'var(--b)' };
    const cardBox = (title, sub, inner, style = '', side = '') => `
        <div class="card" ${style ? `style="${style}"` : ''}>
            <div class="card-h"><div class="card-top"><span class="ico" style="${CARD_TONE[title] ? `color:${CARD_TONE[title]}` : ''}"><i class="fa-solid ${CARD_ICON[title] || 'fa-chart-pie'}" aria-hidden="true"></i></span><div><h5 class="card-t">${esc(title)}</h5>${sub ? `<p class="card-s">${esc(sub)}</p>` : ''}</div></div>${side}</div>
            ${inner}
        </div>`;
    const sec = (color, title, sub) => `<div class="sec"><span class="ico" style="background:color-mix(in srgb, ${color} 18%, transparent);color:${color}"><i class="fa-solid ${SEC_ICON[title] || 'fa-chart-pie'}" aria-hidden="true"></i></span><h4>${esc(title)}</h4><span class="sec-s">${esc(sub)}</span><span class="rule"></span></div>`;
    const pips = (left, max) => `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="pip ${i < left ? 'on' : ''}"></i>`).join('')}</span>`;
    // แสดงครบทุกรายการ — เกิน 6 แถวให้เลื่อนในกล่อง (รองรับอุปกรณ์เสริมหลักร้อยรายการ) ไม่ดันการ์ดให้ยาว
    const lowRows = (items, max, unit) => items.length
        ? `<div class="${items.length > 6 ? 'scroll' : ''}" ${items.length > 6 ? 'tabindex="0" style="--mh:330px"' : ''}>${items.map(i => `<div class="list-row"><span>${esc(i.label)}</span>${pips(i.qty, max)}<span class="left">เหลือ ${fmt(i.qty)} ${unit}</span></div>`).join('')}</div>`
        : `<p class="empty">ไม่มีรายการที่ใกล้หมด</p>`;

    // สภาพ → กลุ่ม มือ 1 / มือ 2 / ไม่ระบุ (ชื่อสภาพที่ขึ้นต้นด้วย "มือ2" ทุกแบบรวมเป็นมือ 2)
    const condGroup = (name) => { const n = String(name).replace(/\s+/g, ''); return n.startsWith('มือ1') ? 'new' : n.startsWith('มือ2') ? 'used' : 'other'; };
    const capNum = (label) => { const m = String(label).match(/([\d.]+)\s*(T|TB|G|GB)?/i); if (!m) return 1e9; const v = parseFloat(m[1]); return /^T/i.test(m[2] || '') ? v * 1000 : v; };
    const capShort = (l) => String(l).replace(/\s*GB$/i, '').replace(/\s*TB?$/i, 'T');

    const renderDashboard = ({ rows, outRows, transfers }) => {
        const body = document.getElementById('dash-body');
        if (!body) return;
        const isAll = dash.scope === 'all';
        const D = summarize(rows.filter(r => kindOf(r.p) === 'device'));
        const A = summarize(rows.filter(r => kindOf(r.p) === 'accessory'));
        const total = D.pieces + A.pieces, totalValue = D.value + A.value;
        const devModels = list(D.models).sort(byQty), accModels = list(A.models).sort(byQty);
        // ใกล้หมด: นับ "ต่อสาขา" เสมอ — สาขาของฉัน = รุ่นที่สาขานี้เหลือน้อย, ทุกสาขา = รุ่น×สาขา ที่เหลือน้อย (แสดงชื่อสาขาต่อท้าย)
        // ถ้ารวมทุกสาขาก่อนแล้วค่อยเทียบ รุ่นที่สาขาเราเหลือ 1 แต่สาขาอื่นมีเยอะจะหลุดจากรายการ ทำให้ "ทุกสาขา" น้อยกว่า "สาขาของฉัน"
        const lowOf = (kind, limit) => {
            const m = new Map();
            rows.filter(r => kindOf(r.p) === kind).forEach(r => {
                const nm = r.p.name || 'ไม่ระบุชื่อ';
                const k = isAll ? `${nm} · ${r.branch}` : nm;
                m.set(k, (m.get(k) || 0) + r.qty);
            });
            return [...m].map(([label, qty]) => ({ label, qty })).filter(i => i.qty <= limit)
                .sort((a, b) => a.qty - b.qty || a.label.localeCompare(b.label, 'th'));
        };
        const devLow = lowOf('device', LOW_DEVICE);
        const accLow = lowOf('accessory', LOW_ACCESSORY);

        // ----- ภาพรวม -----
        const devPct = total ? D.pieces / total * 100 : 0;
        const hero = `
            <div class="hero">
                <div>
                    <div style="font-size:14px;font-weight:500;opacity:.8;display:flex;align-items:center;gap:8px"><i class="fa-solid fa-coins" aria-hidden="true"></i>มูลค่ารวมตามราคาขาย</div>
                    <div class="disp" style="font-size:clamp(34px,4.4vw,54px);font-weight:700;line-height:1.1;letter-spacing:-.02em;margin-top:12px;color:var(--y)">${baht(totalValue)}</div>
                    <div style="font-size:13.5px;margin-top:10px;opacity:.8">${isAll ? 'ทุกสาขา' : 'สาขาของฉัน'} · ${fmt(D.models.size + A.models.size)} รายการ</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:12px">
                    <div style="display:flex;justify-content:space-between;font-size:12.5px;opacity:.8"><span>สัดส่วนตามจำนวนชิ้น</span><span>รวม ${fmt(total)} ชิ้น</span></div>
                    <div style="display:flex;height:12px;gap:3px"><div style="width:${devPct}%;background:var(--yd);border-radius:3px"></div><div style="flex:1;background:var(--td);border-radius:3px"></div></div>
                    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:13px">
                        <span style="display:flex;align-items:center;gap:8px"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>เครื่อง <b>${fmt(D.pieces)}</b> · ${pc(D.pieces, total)}</span>
                        <span style="display:flex;align-items:center;gap:8px"><i class="fa-solid fa-headphones" aria-hidden="true" style="color:var(--t)"></i>อุปกรณ์เสริม <b>${fmt(A.pieces)}</b> · ${pc(A.pieces, total)}</span>
                    </div>
                </div>
            </div>`;
        const stat = (label, color, value, unit, sub, cls = '', icon = 'fa-boxes-stacked') => `
            <div class="stat ${cls}"><div class="stat-l"><i class="fa-solid ${icon}" aria-hidden="true" style="color:${color}"></i>${esc(label)}</div>
            <div class="stat-v">${value}${unit ? `<span class="stat-u">${esc(unit)}</span>` : ''}</div><div class="stat-s">${esc(sub)}</div></div>`;
        const stats = `<div class="stats">
            ${stat('สินค้าทั้งหมด', '#C9CDD6', fmt(total), 'ชิ้น', `${fmt(D.models.size + A.models.size)} รายการ`, '', 'fa-boxes-stacked')}
            ${stat('เครื่อง', '#FFE169', fmt(D.pieces), 'เครื่อง', baht(D.value), '', 'fa-mobile-screen')}
            ${stat('อุปกรณ์เสริม', '#3CCFB4', fmt(A.pieces), 'ชิ้น', baht(A.value), '', 'fa-headphones')}
            ${stat('ใกล้หมด', '#FF7F6B', fmt(devLow.length + accLow.length), 'รายการ', `เครื่อง ≤ ${LOW_DEVICE} · เสริม ≤ ${LOW_ACCESSORY}`, 'warn', 'fa-triangle-exclamation')}
        </div>`;

        // ----- เครื่อง -----
        let machines = '';
        let topCard = ''; // การ์ด "รุ่นที่มีมากที่สุด" — ย้ายไปแถวอุปกรณ์เสริม (สลับที่กับสินค้าใกล้หมด)
        if (D.pieces === 0) {
            machines = `<p class="empty">ไม่มีเครื่องในสต็อก</p><section class="row">@@LOW@@</section>`;
        } else {
            const top10 = devModels.slice(0, 10);
            const top3 = top10.slice(0, 3);
            const top3Sum = top3.reduce((s, x) => s + x.qty, 0);
            topCard = cardBox('รุ่นที่มีมากที่สุด', '10 อันดับแรก · จำนวนเครื่อง',
                barList(top10, D.pieces, (i, k) => k < 3 ? 'f-y' : 'f-yd')
                + (top3.length === 3 ? `<p class="insight">3 รุ่นแรก (${top3.map(x => esc(x.label)).join(', ')}) รวม <b>${fmt(top3Sum)} เครื่อง</b> หรือ <b>${pc(top3Sum, D.pieces)}</b> ของสต็อกเครื่อง</p>` : ''),
                'flex:6 1 480px');

            // สภาพ: โดนัท + มือ 2 แยกตามแหล่งที่มา
            const g = { new: 0, used: 0, other: 0 };
            const used = [];
            list(D.cond).forEach(c => {
                const k = condGroup(c.label); g[k] += c.qty;
                if (k === 'used') used.push({ l: String(c.label).replace(/\s+/g, '').replace(/^มือ2/, '') || 'ทั่วไป', v: c.qty });
            });
            const parts = [['มือ 1', g.new, '#7DB7FF'], ['มือ 2', g.used, '#8B6CFF'], ['ไม่ระบุ', g.other, '#5B606B']].filter(x => x[1] > 0);
            let acc = 0;
            const gap = 1.2, stops = parts.map(([, v, c]) => { const from = acc / D.pieces * 360; acc += v; const to = acc / D.pieces * 360; return `${c} ${from.toFixed(1)}deg ${(to - gap).toFixed(1)}deg, transparent ${(to - gap).toFixed(1)}deg ${to.toFixed(1)}deg`; }).join(', ');
            const mask = 'radial-gradient(farthest-side, transparent 64%, #000 65%)';
            const condCard = cardBox('สภาพสินค้า', 'มือ 1 / มือ 2 ของเครื่อง', `
                <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:36px;flex:1">
                    <div style="position:relative;width:clamp(200px,22vw,264px);aspect-ratio:1">
                        <div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(${stops});-webkit-mask:${mask};mask:${mask}"></div>
                        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="disp" style="font-size:40px;font-weight:600;line-height:1.1">${fmt(D.pieces)}</div><div style="font-size:14px;color:var(--mute)">เครื่อง</div></div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:20px;font-size:15px;min-width:170px">${parts.map(([l, v, c]) => `
                        <div style="display:flex;align-items:center;gap:10px"><span class="dot" style="background:${c}"></span><span style="flex:1">${l}</span><b>${fmt(v)}</b><span class="pct" style="margin-left:2px;min-width:30px;text-align:right">${pc(v, D.pieces)}</span></div>`).join('')}</div>
                </div>
                ${used.length ? `<div style="display:flex;flex-direction:column;gap:10px"><p class="grp"><i class="fa-solid fa-store" aria-hidden="true"></i>มือ 2 แยกตามแหล่งที่มา</p><div style="display:flex;flex-wrap:wrap;gap:8px">${used.sort((a, b) => b.v - a.v).map(u => `<span class="chip">${esc(u.l)}<b>${fmt(u.v)}</b></span>`).join('')}</div></div>` : ''}`,
                'flex:1 1 480px');

            // ความจุ
            const caps = list(D.cap).sort((a, b) => capNum(a.label) - capNum(b.label));
            const capTop = [...caps].sort(byQty);
            const capCols = caps.map(c => ({ ...c, label: capShort(c.label), cls: capTop.slice(0, 2).includes(c) ? 'f-b' : 'f-bd' }));
            const capCard = cardBox('ความจุ', 'จำนวนเครื่อง · GB (1T = 1 TB)', colChart(capCols)
                + (capTop.length >= 2 ? `<p class="insight"><b>${esc(capShort(capTop[0].label))}</b> และ <b>${esc(capShort(capTop[1].label))}</b> รวม <b>${pc(capTop[0].qty + capTop[1].qty, D.pieces)}</b> ของเครื่อง</p>` : ''));

            // สี (6 อันดับ + อื่น ๆ)
            const colAll = list(D.color).sort(byQty);
            const colTop = colAll.slice(0, 6);
            const rest = colAll.slice(6).reduce((s, x) => s + x.qty, 0);
            if (rest) colTop.push({ label: 'อื่น ๆ', qty: rest, doc: null });
            const hex = (c) => c.doc === null ? '#5B606B' : (window.productColorHex ? window.productColorHex(c.label, c.doc) : '#888888');
            const colorCard = cardBox('สี', 'จำนวนเครื่องแยกตามสี',
                barList(colTop, 0, () => '', { cols: 'minmax(80px,112px) 1fr 44px', bgFn: hex }));

            // ช่วงราคา
            const priceCard = cardBox('ช่วงราคา', 'จำนวนเครื่องตามราคาขาย (บาท)', colChart([
                { label: 'ต่ำกว่า 10,000', qty: D.price[0], color: '#5A47B0' },
                { label: '10,000–30,000', qty: D.price[1], color: '#8B6CFF' },
                { label: 'มากกว่า 30,000', qty: D.price[2], color: '#BFAEFF' },
            ]));

            // กลุ่มสินค้า
            const grp = list(D.type).sort(byQty);
            const groupCard = cardBox('กลุ่มสินค้า', grp.map(x => x.label).slice(0, 3).join(' · '), `
                <div><div class="disp" style="font-size:44px;font-weight:600;line-height:1.1;letter-spacing:-.02em">${pc(grp[0].qty, D.pieces)}</div>
                <div style="font-size:13px;color:var(--mute);margin-top:4px">ของเครื่องทั้งหมดเป็น ${esc(grp[0].label)}</div></div>`
                + barList(grp.slice(0, 4), D.pieces, (i, k) => k === 0 ? 'f-y' : 'f-g', { cols: 'minmax(64px,84px) 1fr 80px' }));

            machines = `
                <section class="row">@@LOW@@${condCard}</section>
                <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:16px">${capCard}${colorCard}${priceCard}${groupCard}</section>`;
        }

        // ----- อุปกรณ์เสริม + สต็อกต่ำ -----
        // เรียงมากไปน้อยทุกรายการ เห็น 10 อันดับแรกทันที ที่เหลือเลื่อนดูในกล่อง
        const accLong = accModels.length > 10;
        const accCard = cardBox('อุปกรณ์เสริมที่มีมากที่สุด', `${fmt(A.models.size)} รายการ · จำนวนชิ้น${accLong ? ' · เลื่อนดูทั้งหมด' : ''}`,
            A.pieces ? `<div class="scroll spread" ${accLong ? 'tabindex="0"' : ''} style="--mh:${accLong ? 440 : 9999}px">${barList(accModels, A.pieces, (i, k) => k < 2 ? 'f-t' : 'f-td', { cols: 'minmax(110px,170px) 1fr 76px' })}</div>` : `<p class="empty">ไม่มีอุปกรณ์เสริมในสต็อก</p>`, 'flex:4 1 320px');

        const outProducts = outRows.map(r => ({ label: fullName(r.p) + (r.branch ? ` · ${r.branch}` : '') }))
            .sort((a, b) => a.label.localeCompare(b.label, 'th'));
        const lowCard = cardBox('สินค้าใกล้หมด', `เครื่อง เหลือไม่เกิน ${LOW_DEVICE} · อุปกรณ์เสริม เหลือไม่เกิน ${LOW_ACCESSORY}`, `
            <div><p class="grp"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>เครื่อง</p>${lowRows(devLow, LOW_DEVICE, 'เครื่อง')}</div>
            <div><p class="grp"><i class="fa-solid fa-headphones" aria-hidden="true"></i>อุปกรณ์เสริม</p>${lowRows(accLow, LOW_ACCESSORY, 'ชิ้น')}</div>`,
            'flex:1 1 440px', `<div class="disp" style="font-size:30px;font-weight:600;line-height:1;color:var(--c)">${fmt(devLow.length + accLow.length)}</div>`);

        const outCard = cardBox('หมดสต็อก', 'สินค้าที่ไม่มีของคงเหลือ', outProducts.length
            ? `<div class="${outProducts.length > 6 ? 'scroll' : ''}" ${outProducts.length > 6 ? 'tabindex="0" style="--mh:330px;margin-top:-8px"' : 'style="margin-top:-8px"'}>${outProducts.map(o => `<div class="list-row"><span>${esc(o.label)}</span><span class="left zero">หมดแล้ว</span></div>`).join('')}</div>`
            : `<p class="empty">ไม่มีสินค้าที่หมด</p>`,
            'flex:4 1 320px', `<div class="disp" style="font-size:30px;font-weight:600;line-height:1;color:var(--mute)">${fmt(outProducts.length)}</div>`);

        // ----- สาขา / การเคลื่อนย้าย -----
        const brAll = new Map();
        [D.branch, A.branch].forEach(m => m.forEach((e, k) => { const x = brAll.get(k) || { label: k, qty: 0 }; x.qty += e.qty; brAll.set(k, x); }));
        const brList = [...brAll.values()].sort(byQty);
        const brTotal = brList.reduce((s, x) => s + x.qty, 0);
        const branchCard = cardBox('เปรียบเทียบแต่ละสาขา', 'จำนวนชิ้นคงเหลือ · เครื่องนับจาก IMEI',
            isAll ? barList(brList, brTotal, (i, k) => k === 0 ? 'f-b' : 'f-bd', { cols: 'minmax(80px,110px) 1fr 56px' }) + (brList.length ? `<p class="insight">รวมทุกสาขา <b>${fmt(brTotal)} ชิ้น</b> · มากที่สุด ${esc(brList[0].label)} (${pc(brList[0].qty, brTotal)})</p>` : '')
                : `<p class="empty">เลือก "ทุกสาขา" ด้านบนเพื่อเปรียบเทียบแต่ละสาขา</p>`,
            'flex:1 1 360px');

        const transferring = transfers;
        const transferCard = cardBox('กำลังโอนย้าย', 'ระหว่างสาขา', transferring.length
            ? `<div>${transferring.slice(0, 5).map(p => `<div class="list-row"><div><div style="font-weight:500">${esc(fullName(p))}</div><div class="list-sub">${esc(p.branch_id && p.branch_id.name ? p.branch_id.name : nameOf(p, 'type_id', '-'))}</div></div><span class="mv"><i class="fa-solid fa-truck" aria-hidden="true" style="margin-right:6px"></i>กำลังโอน</span></div>`).join('')}</div>`
                + (transferring.length > 5 ? `<p class="insight">และอีก ${fmt(transferring.length - 5)} รายการ</p>` : '')
            : `<p class="empty">ไม่มีสินค้าที่กำลังโอนย้าย</p>`, 'flex:1 1 360px');

        const newest = [...rows].sort((a, b) => new Date(b.p.createdAt || 0) - new Date(a.p.createdAt || 0));
        const seen = new Set();
        const arrivals = newest.filter(r => { const k = String(r.p._id); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
        const arriveCard = cardBox('เข้าใหม่ล่าสุด', 'เพิ่มเข้าระบบล่าสุด', arrivals.length
            ? `<div>${arrivals.map(r => `<div class="list-row"><div><div style="font-weight:500">${esc(fullName(r.p))}</div><div class="list-sub">${esc(nameOf(r.p, 'type_id', '-'))}</div></div><span style="font-size:12.5px;color:var(--mute);white-space:nowrap"><i class="fa-solid fa-calendar" aria-hidden="true" style="margin-right:6px"></i>${thDate(r.p.createdAt)}</span></div>`).join('')}</div>`
            : `<p class="empty">ยังไม่มีข้อมูล</p>`, 'flex:1 1 360px');

        body.innerHTML = `
            <section class="row" aria-label="ภาพรวม">${hero}${stats}</section>
            ${sec('var(--y)', 'เครื่อง', `${fmt(D.pieces)} เครื่อง · ${baht(D.value)}`)}
            ${machines.replace('@@LOW@@', () => lowCard)}
            ${sec('var(--t)', 'อุปกรณ์เสริมและสต็อกต่ำ', `${fmt(A.pieces)} ชิ้น · ${baht(A.value)}${A.pieces ? ` · เฉลี่ย ${baht(A.value / A.pieces)}/ชิ้น` : ''}`)}
            <section class="row" aria-label="อุปกรณ์เสริมและสินค้าหมดสต็อก">
                ${topCard || ''}${accCard}${outCard}
            </section>
            ${sec('var(--b)', 'สาขาและการเคลื่อนย้าย', 'เปรียบเทียบสต็อก การโอน และสินค้าเข้าใหม่')}
            <section class="row" aria-label="สาขา">${branchCard}${transferCard}${arriveCard}</section>`;

        // เล่นแอนิเมชันแท่งหลังใส่ DOM แล้ว (เริ่มที่ 0 → ค่าจริง)
        requestAnimationFrame(() => requestAnimationFrame(() => {
            body.querySelectorAll('.fill, .col-b').forEach(n => n.classList.add('in'));
        }));
    };

    const dashSkeleton = () => `<div class="skel" style="height:220px"></div><div class="skel"></div><div class="skel"></div>`;

    const setDashScope = (scope) => {
        dash.scope = scope;
        [['mine', 'dash-scope-mine'], ['all', 'dash-scope-all']].forEach(([k, id]) => {
            const b = document.getElementById(id);
            if (!b) return;
            b.className = k === scope ? 'on' : '';
            b.setAttribute('aria-pressed', k === scope);
        });
    };

    window.loadBranchInventoryDashboard = async () => {
        const body = document.getElementById('dash-body');
        if (!body) return;
        setDashScope(dash.scope);
        const my = ++dash.seq; // กันผลของคำขอเก่ามาทับตอนสลับขอบเขตเร็วๆ
        body.innerHTML = dashSkeleton();
        try {
            const data = await dashData(dash.scope);
            if (my !== dash.seq) return;
            renderDashboard(data);
        } catch (err) {
            if (my !== dash.seq) return;
            if (err && err.message === 'NO_BRANCH') {
                body.innerHTML = `<div class="card" style="align-items:center;text-align:center"><p style="color:var(--mute)">บัญชีนี้ยังไม่ได้ผูกกับสาขา จึงไม่มีข้อมูล "สาขาของฉัน" — เลือก "ทุกสาขา" ด้านบนแทน</p></div>`;
                return;
            }
            console.error(err);
            body.innerHTML = `<div class="card" style="align-items:center;text-align:center"><p style="color:var(--c)">เกิดข้อผิดพลาดในการโหลดข้อมูล</p><button type="button" class="icbtn" style="width:auto;padding:0 18px" onclick="window.loadBranchInventoryDashboard()">ลองอีกครั้ง</button></div>`;
        }
    };

    // ==========================================
    // Init
    // ==========================================

    window.initBranchInventory = () => {
        if (!isBranchInventoryInitialized) {
            // ตัวสลับแบบ segmented (กรอบพื้น bg-field ใน HTML): ใบที่เลือก = พื้นยก + ขอบ/ตัวอักษรเหลือง
            // ไม่ใช้เหลืองทึบ — ข้อ 11.9 "เลือกแล้วเปลี่ยนขอบ ไม่ใช่เปลี่ยนพื้น"
            // เขียนเป็น className เต็มแทนการ add/remove ทีละคลาส (แบบเดียวกับแท็บหน้าอื่นทั้งหมดในระบบ)
            // ไม่งั้นคลาสจากมาร์กอัปตั้งต้นจะตกค้างและปุ่มมีเส้นขอบหนาไม่เท่ากัน
            // สไตล์เดียวกับปุ่มประเภทสินค้าในหน้าจ่ายออกสินค้า (js/page-stock-issue.js)
            const TAB_BASE = 'flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus';
            const TAB_ON = 'bg-primary text-on-primary';
            const TAB_OFF = 'bg-field text-body-muted hover:text-ink';

            const views = [
                { tab: 'tab-branch-mystock', content: 'content-branch-mystock', load: () => window.loadBranchInventoryMyStock() },
                { tab: 'tab-branch-globalstock', content: 'content-branch-globalstock', load: () => window.loadBranchInventoryGlobalStock() },
                { tab: 'tab-branch-dashboard', content: 'content-branch-dashboard', load: () => window.loadBranchInventoryDashboard() },
            ].map(v => ({ ...v, tabEl: document.getElementById(v.tab), contentEl: document.getElementById(v.content) }));

            const activateTab = (active) => {
                views.forEach(v => {
                    if (!v.tabEl || !v.contentEl) return;
                    const on = v === active;
                    v.tabEl.className = `${TAB_BASE} ${on ? TAB_ON : TAB_OFF}`;
                    v.tabEl.setAttribute('aria-pressed', on);
                    v.contentEl.classList.toggle('hidden', !on);
                });
            };

            // มาร์กอัปตั้งต้นของแท็บแรกยังไม่มีคลาส tab-toggle-btn (ใส่ตอน activateTab) เรียกครั้งแรกให้ตรงกันตั้งแต่เปิดหน้า
            activateTab(views[0]);
            views.forEach(v => v.tabEl?.addEventListener('click', () => { activateTab(v); v.load(); }));

            document.getElementById('dash-scope-mine')?.addEventListener('click', () => { dash.scope = 'mine'; window.loadBranchInventoryDashboard(); });
            document.getElementById('dash-scope-all')?.addEventListener('click', () => { dash.scope = 'all'; window.loadBranchInventoryDashboard(); });
            document.getElementById('btn-refresh-dashboard')?.addEventListener('click', () => window.loadBranchInventoryDashboard());
            setDashScope(dash.scope);

            document.getElementById('btn-refresh-mystock')?.addEventListener('click', () => window.loadBranchInventoryMyStock());
            document.getElementById('btn-refresh-globalstock')?.addEventListener('click', () => window.loadBranchInventoryGlobalStock());

            // ลิ้นชักตัวกรองเพิ่มเติม + ปุ่มส่งออก
            Object.keys(TABS).forEach(key => {
                document.getElementById(`btn-branch-adv-${key}`)?.addEventListener('click', () => openAdvPanel(key));
                const btn = document.getElementById(`btn-export-${key}`);
                const menu = document.getElementById(`menu-export-${key}`);
                const setMenu = (open) => { menu?.classList.toggle('hidden', !open); btn?.setAttribute('aria-expanded', open); };
                btn?.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.classList.contains('hidden')); });
                menu?.querySelectorAll('[data-export]').forEach(item => item.addEventListener('click', () => {
                    setMenu(false);
                    exportTable(key, item.dataset.export.split(':')[1]);
                }));
                document.addEventListener('click', () => setMenu(false));
            });
            document.querySelectorAll('[data-qty-preset]').forEach(b => b.addEventListener('click', () => {
                const [mn, mx] = b.dataset.qtyPreset.split(':');
                document.getElementById('branch-adv-qty-min').value = mn;
                document.getElementById('branch-adv-qty-max').value = mx;
            }));
            document.getElementById('btn-branch-adv-close')?.addEventListener('click', closeAdvPanel);
            document.getElementById('btn-branch-adv-apply')?.addEventListener('click', applyAdvPanel);
            document.getElementById('btn-branch-adv-reset')?.addEventListener('click', () => {
                resetAdv(advKey);
                fillAdvPanel(advKey);
                closeAdvPanel();
                TABS[advKey].reload();
            });
            // กดพื้นหลังมืดนอกลิ้นชัก หรือกด Esc เพื่อปิด
            advPanel()?.addEventListener('click', (e) => { if (e.target === advPanel()) closeAdvPanel(); });
            advPanel()?.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAdvPanel(); });
            // เลือกชิปสี/ความจุ: เลือกได้ค่าเดียว กดซ้ำที่ตัวเดิมไม่ยกเลิก (มี "ทั้งหมด" ให้กดแทน)
            ['branch-adv-kind', 'branch-adv-type', 'branch-adv-cond', 'branch-adv-color', 'branch-adv-capacity'].forEach(id => {
                document.getElementById(id)?.addEventListener('click', (e) => {
                    const btn = e.target.closest('button[data-value]');
                    if (!btn) return;
                    document.querySelectorAll(`#${id} button`).forEach(b => {
                        const on = b === btn;
                        b.setAttribute('aria-pressed', on);
                        PILL_ON.split(' ').forEach(c => b.classList.toggle(c, on));
                        PILL_OFF.split(' ').forEach(c => b.classList.toggle(c, !on));
                    });
                });
            });

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
                .map(g => `<span class="inline-flex items-center gap-2 text-sm"><i class="fa-solid ${g.icon} text-body-muted" aria-hidden="true"></i><span class="text-body-muted">${g.label}</span><span class="text-ink font-medium">${byGroup[g.kind].pieces.toLocaleString('th-TH')} ชิ้น</span><span class="text-body-muted font-mono">฿${Math.round(byGroup[g.kind].value).toLocaleString('th-TH')}</span></span>`)
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
            if (!myBranchId()) {
                tbody.innerHTML = stateRow('บัญชีนี้ยังไม่ได้ผูกกับสาขา — ดูสินค้าได้ที่แท็บ "สินค้าและราคาสาขาอื่น"');
                setMyStockValue(null);
                return;
            }
            const res = await authFetch(myProductsUrl()); // ระบุสาขาตัวเอง — แอดมินจะไม่เห็นของทุกสาขาปนมา
            const data = await res.json();
            if (!data.success) return;

            const baseItems = data.data.filter(p => Number(p.quantity || 0) > 0 && myQty(p) > 0);
            // ตัวหารของตัวนับ = จำนวนรายการทั้งหมดก่อนกรองประเภท/สภาพ
            totalGroups.mystock = baseItems.length;
            modelNames.mystock = [...new Set(baseItems.map(p => p.name).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'th'));

            const typeFilter = document.getElementById('filter-branch-mystock-type')?.value || 'ALL';
            const condFilter = document.getElementById('filter-branch-mystock-condition')?.value || 'ALL';
            const items = baseItems.filter(p => matchesFilters(p, typeFilter, condFilter) && matchesAdv(p, myQty(p), 'mystock')).sort(byName);

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
            modelNames.globalstock = [...new Set(baseItems.map(p => p.name).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'th'));

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
            const rows = allRows.filter(r => (branchFilter === 'ALL' || r.branch === branchFilter) && matchesAdv(r.p, r.qty, 'globalstock'))
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
                    + `<td class="px-6 py-4 text-ink text-sm">${esc(branch)}</td>`
                    + priceCell(p) + qtyCell(qty, unit),
                    [p.name, p.product_code, branch, ...imeis].join(' '),
                    p, qty, { imeis, branch }
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
