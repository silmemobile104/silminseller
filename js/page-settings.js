// Master Data Settings Logic (การตั้งค่าระบบ)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "การตั้งค่าระบบ" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.showPrompt, window.fetchMasterData,
// window.masterDataCache, API_BASE_URL (global จาก script.js)
(function () {
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
        const masterDataInput = document.getElementById('master-data-input');
    const masterDataCodeInput = document.getElementById('master-data-code-input');
    const masterDataTypeInput = document.getElementById('master-data-type-input');
    const masterDataLimitInput = document.getElementById('master-data-limit-input');
    // วงเงินที่ใช้ไปของผู้จัดจำหน่าย { [ชื่อ]: { used, bill_count } } — โหลดจาก /suppliers/credit-usage
    let _stCreditUsage = {};
    const stBaht = (n) => '฿' + (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const stLoadCreditUsage = async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/suppliers/credit-usage`);
            const json = await res.json();
            if (json.success) _stCreditUsage = json.data || {};
        } catch (err) {
            console.error('Error loading supplier credit usage:', err);
        }
        if (currentSettingsTab === 'supplier') renderSettingsList();
    };
    // ส่วนลดจากเคลมของผู้จัดจำหน่าย { [ชื่อ]: { device:{total,claims}, accessory:{total,claims} } } — โหลดจาก /suppliers/claim-discounts
    let _stClaimDiscounts = {};
    const stLoadClaimDiscounts = async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/suppliers/claim-discounts`);
            const json = await res.json();
            if (json.success) _stClaimDiscounts = json.data || {};
        } catch (err) {
            console.error('Error loading supplier claim discounts:', err);
        }
        if (currentSettingsTab === 'supplier') renderSettingsList();
    };
    // สถานะวงเงินของผู้จัดจำหน่าย: ไม่ตั้งวงเงิน / ปกติ (<80%) / ใกล้เต็ม (>=80%) / เกินวงเงิน (>=100%)
    // class สี spell เต็มทุกตัว เพื่อให้ Tailwind สแกนเจอตอน build
    const ST_TONE = {
        ok: { text: 'text-state-ok', bar: 'bg-state-ok', tint: 'bg-state-ok/15' },
        pending: { text: 'text-state-pending', bar: 'bg-state-pending', tint: 'bg-state-pending/15' },
        danger: { text: 'text-state-danger', bar: 'bg-state-danger', tint: 'bg-state-danger/15' }
    };
    const ST_SUPPLIER_STATUSES = [
        { key: 'ok', label: 'ปกติ', tone: 'ok' },
        { key: 'near', label: 'ใกล้เต็มวงเงิน', tone: 'pending' },
        { key: 'over', label: 'เกินวงเงิน', tone: 'danger' },
        { key: 'nolimit', label: 'ยังไม่ตั้งวงเงิน', tone: 'pending' }
    ];
    const stSupplierStatus = (item) => {
        const limit = Number(item.credit_limit);
        const hasLimit = Number.isFinite(limit) && limit > 0;
        const used = (_stCreditUsage[item.name] && _stCreditUsage[item.name].used) || 0;
        const pct = hasLimit ? (used / limit) * 100 : 0;
        const key = !hasLimit ? 'nolimit' : pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok';
        return { ...ST_SUPPLIER_STATUSES.find(s => s.key === key), limit, hasLimit, used, pct };
    };
    // กรองผู้จัดจำหน่ายตามสถานะวงเงิน: '' = ทั้งหมด, นอกนั้นคือ key ใน ST_SUPPLIER_STATUSES
    let _stStatusFilter = '';
    const masterDataColorPicker = document.getElementById('master-data-color-picker');
    const masterDataColorHex = document.getElementById('master-data-color-hex');
    const ST_HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    // '#abc' / 'abc' / '#AABBCC' -> '#aabbcc' (ใช้กับ <input type=color> ที่รับเฉพาะ 6 หลักตัวพิมพ์เล็ก)
    const stSixHex = (v) => {
        const m = ST_HEX_RE.exec(String(v || '').trim());
        if (!m) return '';
        const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
        return '#' + h.toLowerCase();
    };
    // ผูกตัวเลือกสีกับช่องพิมพ์ hex ให้ตามกันทั้งสองทาง (ผูกครั้งเดียว)
    if (masterDataColorPicker && masterDataColorHex) {
        masterDataColorPicker.addEventListener('input', () => { masterDataColorHex.value = masterDataColorPicker.value.toUpperCase(); });
        masterDataColorHex.addEventListener('input', () => {
            const six = stSixHex(masterDataColorHex.value);
            if (six) masterDataColorPicker.value = six;
        });
    }
    const btnAddMasterData = document.getElementById('btn-add-master-data');
    const masterDataList = document.getElementById('master-data-list');
    let currentSettingsTab = 'productname';

    // Master Data Settings Logic
    // ---------- รายการข้อมูลพื้นฐาน (DESIGN.md ข้อ 11.3 - 11.7) ----------
    let _stSearch = '';
    // กรองชื่อสินค้าตามประเภท: '' = ทั้งหมด, 'none' = ยังไม่ระบุประเภท, นอกนั้นคือ _id ของ ProductType
    let _stTypeFilter = '';
    let _stBound = false;

    // ชื่อข้อมูลมาจากฐานข้อมูลแล้วถูกยัดเข้า innerHTML — ของเดิมใส่ดิบๆ ทั้งในเนื้อการ์ดและ data-name
    const stEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const ST_TABS = {
        productname: { label: 'ชื่อสินค้า', key: 'productNames' },
        producttype: { label: 'ประเภทสินค้า', key: 'productTypes' },
        productunit: { label: 'หน่วยนับ', key: 'productUnits' },
        productcolor: { label: 'สี', key: 'productColors' },
        productcapacity: { label: 'ความจุ', key: 'productCapacities' },
        productcondition: { label: 'สภาพเครื่อง', key: 'productConditions' },
        supplier: { label: 'ผู้จัดจำหน่าย', key: 'suppliers' },
        financecompany: { label: 'บริษัทจัดไฟแนนซ์', key: 'financeCompanies' }
    };

    const stDataOf = (tab) => {
        const conf = ST_TABS[tab];
        if (!conf || !window.masterDataCache) return [];
        return window.masterDataCache[conf.key] || [];
    };

    const stStateBox = (msg, cls = 'text-ink/50 italic') =>
        `<div class="col-span-full px-6 py-10 text-center ${cls}">${stEsc(msg)}</div>`;

    const stSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const stRenderChips = () => {
        const box = document.getElementById('settings-active-filters');
        if (!box) return;
        box.innerHTML = '';
        if (!_stSearch.trim()) return;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40' +
            'text-ink text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
        chip.innerHTML = `<span>ค้นหา: ${stEsc(_stSearch.trim())}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
        chip.setAttribute('aria-label', `ลบตัวกรอง ค้นหา ${_stSearch.trim()}`);
        chip.addEventListener('click', (e) => {
            if (!e.target.closest('i.fa-xmark')) return;
            _stSearch = '';
            const s = document.getElementById('settings-search');
            if (s) s.value = '';
            renderSettingsList();
        });
        box.appendChild(chip);
    };

    // ตัวเลขจำนวนรายการท้ายเมนูย่อยใน sidebar นับจากข้อมูลจริงทุกหมวด
    const stUpdateTabBadges = () => {
        document.querySelectorAll('#nav-settings-submenu [data-settings-tab]').forEach(a => {
            const c = a.querySelector('.settings-nav-count');
            if (!c) return;
            const tab = a.dataset.settingsTab;
            c.textContent = stDataOf(tab).length;
        });
    };

    // สไตล์ปุ่มกรองประเภท (ชิปในแท็บชื่อสินค้า) ยังใช้ร่วมกัน
    const ST_TAB_ON = 'bg-primary text-on-primary ring-1 ring-accent-ink apple-active-accent';
    const ST_TAB_OFF = 'elev-field bg-field text-body-muted hover:ring-1 hover:ring-accent-ink hover:text-ink';

    const stActivateTab = (tab) => {
        document.querySelectorAll('#nav-settings-submenu [data-settings-tab]').forEach(a => {
            a.classList.toggle('active', a.dataset.settingsTab === tab);
        });
    };

    const stTypes = () => (window.masterDataCache && window.masterDataCache.productTypes) || [];
    // type_id ของชื่อสินค้าอาจเป็น string / object ที่ populate แล้ว — ดึงเป็น string id เสมอ
    const stNameTypeId = (item) => item.type_id ? String(item.type_id._id || item.type_id) : '';

    // ช่อง "รหัสชื่อสินค้า" ในฟอร์มเพิ่ม แสดงเฉพาะเมื่อเลือกประเภท "อุปกรณ์เสริม" เท่านั้น
    const ST_ACCESSORY_TYPE_NAME = 'อุปกรณ์เสริม';
    const stIsAccessorySelected = () => {
        if (currentSettingsTab !== 'productname' || !masterDataTypeInput || !masterDataTypeInput.value) return false;
        const t = stTypes().find(x => String(x._id) === masterDataTypeInput.value);
        return !!t && String(t.name).trim() === ST_ACCESSORY_TYPE_NAME;
    };
    const stSyncCodeField = () => {
        const show = stIsAccessorySelected();
        const codeWrap = document.getElementById('master-data-code-wrap');
        if (codeWrap) codeWrap.classList.toggle('hidden', !show);
        if (masterDataCodeInput) {
            masterDataCodeInput.classList.toggle('hidden', !show);
            if (!show) masterDataCodeInput.value = '';
        }
    };

    // ชิปกรองประเภท + ตัวเลือกประเภทในฟอร์มเพิ่ม (เติมใหม่ทุกครั้งที่ render เพราะประเภทอาจถูกเพิ่ม/ลบ)
    const stRenderTypeControls = () => {
        const isName = currentSettingsTab === 'productname';
        const wrap = document.getElementById('master-data-type-wrap');
        if (wrap) wrap.classList.toggle('hidden', !isName);
        const isSupplier = currentSettingsTab === 'supplier';
        const bar = document.getElementById('settings-type-filter');
        if (bar) bar.classList.toggle('hidden', !isName && !isSupplier);
        const limitWrap = document.getElementById('master-data-limit-wrap');
        if (limitWrap) limitWrap.classList.toggle('hidden', currentSettingsTab !== 'supplier');
        // ผู้จัดจำหน่าย: ซ่อนฟอร์มเดิม แสดงเฉพาะปุ่มเพิ่ม (เปิด popup)
        const formCard = document.getElementById('master-data-form-card');
        if (formCard) formCard.classList.toggle('hidden', isSupplier);
        const supplierAddBar = document.getElementById('supplier-add-bar');
        if (supplierAddBar) supplierAddBar.classList.toggle('hidden', !isSupplier);
        const colorWrap = document.getElementById('master-data-color-wrap');
        if (colorWrap) colorWrap.classList.toggle('hidden', currentSettingsTab !== 'productcolor');

        // ผู้จัดจำหน่าย: ชิปกรองตามสถานะวงเงิน (จุดสี + จำนวน)
        if (isSupplier && bar) {
            const sups = stDataOf('supplier');
            const counts = {};
            sups.forEach(s => { const k = stSupplierStatus(s).key; counts[k] = (counts[k] || 0) + 1; });
            const opts = [{ key: '', label: 'ทั้งหมด', n: sups.length }]
                .concat(ST_SUPPLIER_STATUSES.map(s => ({ key: s.key, label: s.label, tone: s.tone, n: counts[s.key] || 0 })));
            bar.setAttribute('aria-label', 'กรองตามสถานะวงเงิน');
            bar.innerHTML = opts.map(o => {
                const on = _stStatusFilter === o.key;
                const dot = o.tone ? `<span class="w-1.5 h-1.5 rounded-full ${ST_TONE[o.tone].bar}" aria-hidden="true"></span>` : '';
                return `<button type="button" data-status-filter="${o.key}" aria-pressed="${on}"
                    class="${on ? ST_TAB_ON : ST_TAB_OFF} elev-chip px-3.5 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer">
                    ${dot}${stEsc(o.label)} <span class="opacity-70">${o.n}</span></button>`;
            }).join('');
            bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                _stStatusFilter = b.dataset.statusFilter;
                renderSettingsList();
            }));
            return;
        }
        if (!isName) return;
        if (bar) bar.setAttribute('aria-label', 'กรองตามประเภทสินค้า');

        if (masterDataTypeInput) {
            const keep = masterDataTypeInput.value;
            masterDataTypeInput.innerHTML = '<option value="">ไม่ระบุประเภท</option>' +
                stTypes().map(t => `<option value="${stEsc(t._id)}">${stEsc(t.name)}</option>`).join('');
            masterDataTypeInput.value = stTypes().some(t => String(t._id) === keep) ? keep : '';
        }
        if (bar) {
            const names = stDataOf('productname');
            const count = (id) => names.filter(n => id === 'none' ? !stNameTypeId(n) : stNameTypeId(n) === id).length;
            const opts = [{ id: '', label: 'ทั้งหมด', n: names.length }]
                .concat(stTypes().map(t => ({ id: String(t._id), label: t.name, n: count(String(t._id)) })))
                .concat([{ id: 'none', label: 'ยังไม่ระบุประเภท', n: count('none') }]);
            bar.innerHTML = opts.map(o => {
                const on = _stTypeFilter === o.id;
                return `<button type="button" data-type-filter="${stEsc(o.id)}" aria-pressed="${on}"
                    class="${on ? ST_TAB_ON : ST_TAB_OFF} elev-chip px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer">
                    ${stEsc(o.label)} <span class="opacity-70">${o.n}</span></button>`;
            }).join('');
            bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                _stTypeFilter = b.dataset.typeFilter;
                renderSettingsList();
            }));
        }
    };

    // ฟอร์มแก้ไขผู้จัดจำหน่าย: ชื่อ + วงเงิน (บังคับ) ในหน้าต่างเดียว
    // showConfirm ปิดตัวเองหลังกดยืนยันเสมอ ถ้าข้อมูลไม่ผ่านจึงแจ้งเตือนแล้วเปิดใหม่พร้อมค่าที่กรอกไว้
    const stSupplierEditDialog = (id, oldName, oldLimit) => {
        const fieldCls = 'elev-field w-full px-4 py-2.5 rounded-xl bg-field text-ink focus:ring-2 focus:ring-accent-ink focus:outline-none transition-all text-sm';
        const labelCls = 'text-ink font-medium flex items-center gap-2 text-xs mb-1.5';
        showConfirm('แก้ไขผู้จัดจำหน่าย',
            `<div class="text-left space-y-4">
                <div>
                    <label for="st-supplier-edit-name" class="${labelCls}"><i class="fa-solid fa-truck-front"></i> ชื่อผู้จัดจำหน่าย <span class="text-red-500">*</span></label>
                    <input type="text" id="st-supplier-edit-name" autocomplete="off" value="${stEsc(oldName)}" class="${fieldCls}">
                </div>
                <div>
                    <label for="st-supplier-edit-limit" class="${labelCls}"><i class="fa-solid fa-hand-holding-dollar"></i> วงเงิน (บาท) <span class="text-red-500">*</span></label>
                    <input type="number" id="st-supplier-edit-limit" min="1" step="any" inputmode="decimal" value="${stEsc(oldLimit)}" placeholder="เช่น 500000"
                        class="${fieldCls} font-mono text-right">
                </div>
            </div>`,
            () => {
                const nameVal = (document.getElementById('st-supplier-edit-name')?.value || '').trim();
                const limitRaw = (document.getElementById('st-supplier-edit-limit')?.value || '').trim();
                const lim = Number(limitRaw);
                if (!nameVal) {
                    showToast('กรุณาระบุชื่อผู้จัดจำหน่าย', 'error');
                    return setTimeout(() => stSupplierEditDialog(id, nameVal, limitRaw), 350);
                }
                if (!limitRaw || !Number.isFinite(lim) || lim <= 0) {
                    showToast('กรุณาระบุวงเงิน (ต้องมากกว่า 0)', 'error');
                    return setTimeout(() => stSupplierEditDialog(id, nameVal, limitRaw), 350);
                }
                if (nameVal === oldName && lim === Number(oldLimit)) return;
                editMasterData(id, nameVal, '', undefined, undefined, lim);
            },
            'บันทึก', 'success', 'max-w-md');
    };

    // ฟอร์มแก้ไขชื่อสินค้าประเภทอุปกรณ์เสริม: ชื่อ + รหัส (บังคับ) ในหน้าต่างเดียว
    const stAccessoryEditDialog = (id, oldName, oldCode, curName = oldName, curCode = oldCode) => {
        const fieldCls = 'elev-field w-full px-4 py-2.5 rounded-xl bg-field text-ink focus:ring-2 focus:ring-accent-ink focus:outline-none transition-all text-sm';
        const labelCls = 'text-ink font-medium flex items-center gap-2 text-xs mb-1.5';
        showConfirm('แก้ไขชื่อสินค้า',
            `<div class="text-left space-y-4">
                <div>
                    <label for="st-acc-edit-name" class="${labelCls}"><i class="fa-solid fa-mobile-screen"></i> ชื่อสินค้า <span class="text-red-500">*</span></label>
                    <input type="text" id="st-acc-edit-name" autocomplete="off" value="${stEsc(curName)}" class="${fieldCls}">
                </div>
                <div>
                    <label for="st-acc-edit-code" class="${labelCls}"><i class="fa-solid fa-barcode"></i> รหัสชื่อสินค้า <span class="text-red-500">*</span></label>
                    <input type="text" id="st-acc-edit-code" autocomplete="off" value="${stEsc(curCode)}" placeholder="เช่น CASE-11" class="${fieldCls} font-mono">
                </div>
            </div>`,
            () => {
                const nameVal = (document.getElementById('st-acc-edit-name')?.value || '').trim();
                const codeVal = (document.getElementById('st-acc-edit-code')?.value || '').trim();
                if (!nameVal || !codeVal) {
                    showToast(!nameVal ? 'กรุณาระบุชื่อสินค้า' : 'กรุณาระบุรหัสชื่อสินค้าของอุปกรณ์เสริม', 'error');
                    return setTimeout(() => stAccessoryEditDialog(id, oldName, oldCode, nameVal, codeVal), 350);
                }
                if (nameVal === oldName && codeVal === oldCode) return;
                editMasterData(id, nameVal, codeVal);
            },
            'บันทึก', 'success', 'max-w-md');
    };

    // popup เพิ่มผู้จัดจำหน่าย: ชื่อ + วงเงิน (บังคับ) — ถ้าข้อมูลไม่ผ่านจะแจ้งเตือนแล้วเปิดใหม่พร้อมค่าที่กรอกไว้
    const stSupplierAddDialog = (oldName = '', oldLimit = '') => {
        const fieldCls = 'elev-field w-full px-4 py-2.5 rounded-xl bg-field text-ink focus:ring-2 focus:ring-accent-ink focus:outline-none transition-all text-sm';
        const labelCls = 'text-ink font-medium flex items-center gap-2 text-xs mb-1.5';
        showConfirm('เพิ่มผู้จัดจำหน่าย',
            `<div class="text-left space-y-4">
                <div>
                    <label for="st-supplier-add-name" class="${labelCls}"><i class="fa-solid fa-truck-front"></i> ชื่อผู้จัดจำหน่าย <span class="text-red-500">*</span></label>
                    <input type="text" id="st-supplier-add-name" autocomplete="off" value="${stEsc(oldName)}" placeholder="เช่น SYSNEX" class="${fieldCls}">
                </div>
                <div>
                    <label for="st-supplier-add-limit" class="${labelCls}"><i class="fa-solid fa-hand-holding-dollar"></i> วงเงิน (บาท) <span class="text-red-500">*</span></label>
                    <input type="number" id="st-supplier-add-limit" min="1" step="any" inputmode="decimal" value="${stEsc(oldLimit)}" placeholder="เช่น 500000"
                        class="${fieldCls} font-mono text-right">
                </div>
            </div>`,
            async () => {
                const nameVal = (document.getElementById('st-supplier-add-name')?.value || '').trim();
                const limitRaw = (document.getElementById('st-supplier-add-limit')?.value || '').trim();
                const lim = Number(limitRaw);
                if (!nameVal) {
                    showToast('กรุณาระบุชื่อผู้จัดจำหน่าย', 'error');
                    return setTimeout(() => stSupplierAddDialog(nameVal, limitRaw), 350);
                }
                if (!limitRaw || !Number.isFinite(lim) || lim <= 0) {
                    showToast('กรุณาระบุวงเงิน (ต้องมากกว่า 0)', 'error');
                    return setTimeout(() => stSupplierAddDialog(nameVal, limitRaw), 350);
                }
                try {
                    const response = await authFetch(`${API_BASE_URL}/master/supplier`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: nameVal, credit_limit: lim })
                    });
                    const result = await response.json();
                    if (result.success) {
                        showToast('เพิ่มข้อมูลสำเร็จ');
                        await fetchMasterData();
                    } else {
                        showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                        setTimeout(() => stSupplierAddDialog(nameVal, limitRaw), 350);
                    }
                } catch (error) {
                    console.error('Error adding supplier:', error);
                    showToast('ไม่สามารถเพิ่มข้อมูลได้', 'error');
                }
            },
            'เพิ่ม', 'success', 'max-w-md');
    };

    const btnOpenSupplierAdd = document.getElementById('btn-open-supplier-add');
    if (btnOpenSupplierAdd) btnOpenSupplierAdd.addEventListener('click', () => stSupplierAddDialog());

    // การ์ดผู้จัดจำหน่าย (ดีไซน์ Figma "Desktop - 53"): ชื่อ + ป้ายสถานะ + ปุ่มแก้ไข/ลบ,
    // วงเงิน/แถบใช้ไป/คงเหลือ, ส่วนลดจากเคลมแยกเครื่อง/อุปกรณ์เสริม + ตารางใบเคลมที่กางดูได้
    // ใช้ class btn-edit-master / btn-delete-master เดิมเพื่อให้ตัวผูก listener ท้าย renderSettingsList ทำงานต่อ
    const stSupplierCard = (item) => {
        const st = stSupplierStatus(item);
        const tone = ST_TONE[st.tone];
        const sid = stEsc(item._id);

        const creditBlock = st.hasLimit
            ? `<div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs">
                    <span class="text-ink/70">วงเงิน <span class="font-mono text-ink font-semibold">${stBaht(st.limit)}</span></span>
                    <span class="font-mono font-semibold ${tone.text}">${st.pct.toFixed(1)}%</span>
                </div>
                <div class="h-1.5 rounded-full bg-chip/60 overflow-hidden" role="progressbar" aria-label="วงเงินที่ใช้ไปของ ${stEsc(item.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(st.pct))}">
                    <div class="h-full rounded-full ${tone.bar}" style="width:${Math.min(100, st.pct)}%"></div>
                </div>
                <div class="flex items-center justify-between text-[11px] text-ink/70">
                    <span>ใช้ไป <span class="font-mono ${tone.text} font-semibold">${stBaht(st.used)}</span></span>
                    <span>คงเหลือ <span class="font-mono text-ink">${stBaht(Math.max(0, st.limit - st.used))}</span></span>
                </div>
            </div>`
            : `<div class="text-xs ${tone.text}">ยังไม่ได้ตั้งวงเงิน — กดแก้ไขเพื่อกำหนด${st.used > 0 ? ` (ใช้ไปแล้ว <span class="font-mono">${stBaht(st.used)}</span>)` : ''}</div>`;

        // ส่วนลดจากเคลม: สรุปยอด + จำนวนของแต่ละชนิด แล้วกางตารางรายใบเคลมได้
        const cd = _stClaimDiscounts[item.name];
        const kinds = [['device', 'สำหรับเครื่อง', 'IMEI', 'IMEI'], ['accessory', 'สำหรับอุปกรณ์เสริม', 'จำนวน', 'ชิ้น']];
        const hasClaims = !!cd && kinds.some(([k]) => cd[k] && cd[k].total > 0);
        const countOf = (k) => ((cd && cd[k] && cd[k].claims) || []).reduce((sum, c) =>
            sum + ((c.items && c.items.length) ? c.items.reduce((s, it) => s + (k === 'device' ? 1 : (Number(it.quantity) || 1)), 0) : 1), 0);
        const detailId = `st-claim-detail-${sid}`;

        let claimBlock;
        if (hasClaims) {
            const summary = kinds.map(([k, label, , unit]) => {
                const total = cd[k] && cd[k].total > 0 ? cd[k].total : 0;
                return `<div class="flex items-center justify-between rounded-lg bg-surface-tile-2/60 px-2.5 py-1.5 text-xs">
                    <span class="text-ink">${label}${total ? ` <span class="text-ink/55 text-[10px]">· ${countOf(k)} ${unit}</span>` : ''}</span>
                    ${total ? `<span class="font-mono font-semibold text-state-ok">${stBaht(total)}</span>` : '<span class="text-ink/40">—</span>'}
                </div>`;
            }).join('');
            const details = kinds.filter(([k]) => cd[k] && cd[k].total > 0).map(([k, label, idHead]) => {
                const rows = cd[k].claims.map(c => {
                    const its = (c.items && c.items.length) ? c.items : [{ product_name: '-', imei: '', quantity: 1 }];
                    return its.map((it, n) => `<tr class="border-t border-line/60">
                        ${n === 0 ? `<td rowspan="${its.length}" class="px-2 py-1.5 align-top font-mono text-[10px] text-accent-ink whitespace-nowrap">${stEsc(c.claim_no)}</td>` : ''}
                        <td class="px-2 py-1.5 text-ink">${stEsc(it.product_name)}${it.color_name ? ` <span class="text-ink/60">· ${stEsc(it.color_name)}</span>` : ''}</td>
                        <td class="px-2 py-1.5 font-mono text-ink/80 whitespace-nowrap">${it.imei ? stEsc(it.imei) : `× ${Number(it.quantity) || 1}`}</td>
                        ${n === 0 ? `<td rowspan="${its.length}" class="px-2 py-1.5 align-top text-right font-mono font-semibold text-state-ok whitespace-nowrap">${stBaht(c.amount)}</td>` : ''}
                    </tr>`).join('');
                }).join('');
                return `<div class="space-y-1">
                    <div class="text-[11px] text-ink/70 font-semibold">${label}</div>
                    <div class="rounded-lg overflow-x-auto bg-surface-tile-2/60" tabindex="0">
                        <table class="w-full text-left text-[11px] border-collapse">
                            <thead class="text-ink/60"><tr>
                                <th class="px-2 py-1.5 font-semibold">ใบเคลม</th>
                                <th class="px-2 py-1.5 font-semibold">สินค้า</th>
                                <th class="px-2 py-1.5 font-semibold">${idHead}</th>
                                <th class="px-2 py-1.5 font-semibold text-right">ส่วนลด</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;
            }).join('');
            claimBlock = `<div class="space-y-2">${summary}
                <button type="button" class="st-claim-toggle text-xs font-semibold text-accent-ink hover:underline flex items-center gap-1 cursor-pointer"
                    aria-expanded="false" aria-controls="${detailId}">
                    <span class="st-claim-toggle-label">ดูรายการใบเคลม</span>
                    <i class="fa-solid fa-chevron-right text-[9px] transition-transform" aria-hidden="true"></i>
                </button>
                <div id="${detailId}" class="hidden space-y-3">${details}</div>
            </div>`;
        } else {
            claimBlock = '<div class="text-xs text-ink/45">ยังไม่มีส่วนลดจากเคลม</div>';
        }

        return `
        <div class="elev-field bg-field rounded-xl p-4 flex flex-col gap-3 hover:ring-1 hover:ring-accent-ink transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-1.5">
                    <div class="text-ink font-semibold text-sm truncate" title="${stEsc(item.name)}">${stEsc(item.name)}</div>
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold ${tone.tint} ${tone.text}">
                        <span class="w-1.5 h-1.5 rounded-full ${tone.bar}" aria-hidden="true"></span>${st.label}
                    </span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" class="btn-edit-master w-7 h-7 rounded-[0.4375rem] bg-chip text-ink hover:text-amber-400 transition-colors flex items-center justify-center cursor-pointer"
                        data-id="${sid}" data-name="${stEsc(item.name)}" data-code="" data-limit="${stEsc(item.credit_limit == null ? '' : item.credit_limit)}"
                        title="แก้ไข" aria-label="แก้ไข ${stEsc(item.name)}">
                        <i class="fa-solid fa-pen text-xs"></i>
                    </button>
                    <button type="button" class="btn-delete-master w-7 h-7 rounded-[0.4375rem] bg-chip text-state-danger-soft hover:text-red-400 transition-colors flex items-center justify-center cursor-pointer"
                        data-id="${sid}" data-name="${stEsc(item.name)}"
                        title="ลบ" aria-label="ลบ ${stEsc(item.name)}">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
            <div class="border-t border-line pt-3">${creditBlock}</div>
            <div class="border-t border-line pt-3 space-y-2">
                <div class="text-xs text-ink font-semibold flex items-center gap-1.5"><i class="fa-solid fa-tag" aria-hidden="true"></i> ส่วนลดจากเคลม</div>
                ${claimBlock}
            </div>
        </div>`;
    };

    function renderSettingsList() {
        if (!masterDataList) return;

        // ผูก listener ครั้งเดียว (loadPageView แทรก HTML ครั้งเดียว)
        if (!_stBound) {
            _stBound = true;
            const s = document.getElementById('settings-search');
            if (s) {
                let t = null;
                s.addEventListener('input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => { _stSearch = s.value; renderSettingsList(); }, 200);
                });
            }
        }


        const conf = ST_TABS[currentSettingsTab] || ST_TABS.productname;
        stSetText('settings-panel-title', '');
        const title = document.getElementById('settings-panel-title');
        const isSupplierTab = currentSettingsTab === 'supplier';
        if (title) title.innerHTML = isSupplierTab
            ? '<i class="fa-solid fa-truck-front text-accent-ink"></i> ผู้จัดจำหน่าย (Supplier)'
            : `<i class="fa-solid fa-list-ul text-accent-ink"></i> ${stEsc(conf.label)}`;

        // ผู้จัดจำหน่ายแสดงเป็นการ์ด 3 คอลัมน์ (หมวดอื่นคง 4 คอลัมน์บนจอ 2xl)
        masterDataList.classList.toggle('2xl:grid-cols-4', !isSupplierTab);
        // ฟอร์มเพิ่ม: ป้ายและตัวอย่างของช่องชื่อเปลี่ยนตามหมวด
        const nameLabel = document.querySelector('label[for="master-data-input"]');
        if (nameLabel) nameLabel.innerHTML = isSupplierTab
            ? '<i class="fa-solid fa-truck-front text-ink"></i> ชื่อผู้จัดจำหน่าย <span class="text-red-500">*</span>'
            : '<i class="fa-solid fa-plus text-ink"></i> เพิ่มข้อมูลใหม่ <span class="text-red-500">*</span>';
        if (masterDataInput) masterDataInput.placeholder = isSupplierTab ? 'เช่น SYSNEX' : 'พิมพ์ข้อมูลใหม่...';
        const searchInput = document.getElementById('settings-search');
        if (searchInput) searchInput.placeholder = isSupplierTab ? 'ค้นหาผู้จัดจำหน่าย...' : 'ค้นหาในหมวดนี้...';

        stActivateTab(currentSettingsTab);
        stUpdateTabBadges();
        stRenderChips();
        stRenderTypeControls();
        stSyncCodeField();

        const all = stDataOf(currentSettingsTab);
        const q = _stSearch.trim().toLowerCase();
        const typeFilter = currentSettingsTab === 'productname' ? _stTypeFilter : '';
        const rows = all.filter(item => {
            if (typeFilter === 'none' && stNameTypeId(item)) return false;
            if (typeFilter && typeFilter !== 'none' && stNameTypeId(item) !== typeFilter) return false;
            if (currentSettingsTab === 'supplier' && _stStatusFilter && stSupplierStatus(item).key !== _stStatusFilter) return false;
            return !q || [item.name, item.code].filter(Boolean).join(' ').toLowerCase().includes(q);
        });

        stSetText('settings-result-count', all.length ? `แสดง ${rows.length} จาก ${all.length} รายการ` : '');

        if (!rows.length) {
            masterDataList.innerHTML = stStateBox(all.length
                ? 'ไม่พบข้อมูลที่ตรงกับคำค้นหา'
                : 'ยังไม่มีข้อมูลในหมวดนี้ เพิ่มข้อมูลใหม่ได้จากช่องด้านบน');
            return;
        }

        masterDataList.innerHTML = rows.map(item => {
            if (currentSettingsTab === 'supplier') return stSupplierCard(item);
            // หมวด "สี" โชว์ตัวอย่างสีจริงด้วย เพราะหน้านี้คือที่ที่ตั้งค่าสีของเครื่อง
            // ใช้ตัวสร้างกลาง window.productColorDot() ตามข้อ 11.14 (ห้ามเขียนมาร์กอัปเอง)
            const swatch = (currentSettingsTab === 'productcolor' && typeof window.productColorDot === 'function')
                ? window.productColorDot(item.name, item)
                : '';
            const codeBadge = (currentSettingsTab === 'productname' && item.code)
                ? `<span class="px-2 py-0.5 rounded-[0.375rem] text-[10px] font-mono font-semibold bg-chip/60 text-accent-ink shrink-0">${stEsc(item.code)}</span>`
                : '';

            // หมวดสี: ช่องเลือกสีบนการ์ด เปลี่ยนแล้วบันทึกทันที + แสดงรหัส hex ปัจจุบัน
            const colorEdit = currentSettingsTab === 'productcolor'
                ? `<span class="font-mono text-[10px] text-ink/70 shrink-0">${stEsc(item.color_code || '')}</span>
                   <input type="color" class="st-color-pick h-7 w-9 shrink-0 rounded-lg bg-elevated p-0.5 cursor-pointer"
                        value="${stSixHex(item.color_code || (window.productColorHex ? window.productColorHex(item.name, item) : '')) || '#8e8e93'}"
                        data-id="${stEsc(item._id)}" data-name="${stEsc(item.name)}" aria-label="เลือกรหัสสีของ ${stEsc(item.name)}">`
                : '';

            // ชื่อสินค้าแต่ละชิ้นเลือกประเภทได้ตรงบนการ์ด (เปลี่ยนแล้วบันทึกทันที)
            const typeSelect = currentSettingsTab === 'productname'
                ? `<select class="st-name-type elev-modal bg-elevated text-ink text-xs rounded-lg px-2 py-1.5 max-w-[8.5rem] shrink-0 focus:ring-2 focus:ring-accent-ink focus:outline-none cursor-pointer"
                        data-id="${stEsc(item._id)}" data-name="${stEsc(item.name)}" data-code="${stEsc(item.code || '')}" aria-label="ประเภทสินค้าของ ${stEsc(item.name)}">
                        <option value="">ไม่ระบุประเภท</option>
                        ${stTypes().map(t => `<option value="${stEsc(t._id)}" ${stNameTypeId(item) === String(t._id) ? 'selected' : ''}>${stEsc(t.name)}</option>`).join('')}
                    </select>`
                : '';

            return `
            <div class="elev-field bg-field rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 hover:ring-1 hover:ring-accent-ink transition-colors">
                ${swatch}
                <span class="text-ink font-medium flex-1 min-w-[8rem] break-words" title="${stEsc(item.name)}">${stEsc(item.name)}</span>
                ${codeBadge}
                ${typeSelect}
                ${colorEdit}
                <!-- ปุ่มต้องเห็นตลอด ของเดิมหรี่ไว้ครึ่งหนึ่งแล้วค่อยชัดตอนเอาเมาส์ชี้
                     ซึ่งคนใช้คีย์บอร์ดและผู้ใช้บนมือถือเสียเปรียบ -->
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" class="btn-edit-master text-ink hover:text-amber-400 transition-colors p-1.5 cursor-pointer"
                        data-id="${stEsc(item._id)}" data-name="${stEsc(item.name)}" data-code="${stEsc(item.code || '')}" data-limit="${stEsc(item.credit_limit == null ? '' : item.credit_limit)}"
                        title="แก้ไข" aria-label="แก้ไข ${stEsc(item.name)}">
                        <i class="fa-solid fa-pen text-xs"></i>
                    </button>
                    <button type="button" class="btn-delete-master text-ink hover:text-red-400 transition-colors p-1.5 cursor-pointer"
                        data-id="${stEsc(item._id)}" data-name="${stEsc(item.name)}"
                        title="ลบ" aria-label="ลบ ${stEsc(item.name)}">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>`;
        }).join('');

        // กาง/พับตารางใบเคลมของผู้จัดจำหน่าย
        masterDataList.querySelectorAll('.st-claim-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = document.getElementById(btn.getAttribute('aria-controls'));
                if (!panel) return;
                const open = panel.classList.toggle('hidden') === false;
                btn.setAttribute('aria-expanded', String(open));
                btn.querySelector('.st-claim-toggle-label').textContent = open ? 'ซ่อนรายการใบเคลม' : 'ดูรายการใบเคลม';
                btn.querySelector('i').classList.toggle('rotate-90', open);
            });
        });

        masterDataList.querySelectorAll('.st-color-pick').forEach(inp => {
            // change (ไม่ใช่ input) = ผู้ใช้เลือกเสร็จแล้ว ไม่ยิงบันทึกทุกครั้งที่ลากในจานสี
            inp.addEventListener('change', () => editMasterData(inp.dataset.id, inp.dataset.name, '', undefined, inp.value.toUpperCase()));
        });

        masterDataList.querySelectorAll('.st-name-type').forEach(sel => {
            sel.addEventListener('change', () => editMasterData(sel.dataset.id, sel.dataset.name, sel.dataset.code || '', sel.value || null));
        });

        masterDataList.querySelectorAll('.btn-edit-master').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const oldName = btn.dataset.name;
                const oldCode = btn.dataset.code || '';

                if (currentSettingsTab === 'productname') {
                    const row = stDataOf('productname').find(x => String(x._id) === String(id));
                    const rowType = stTypes().find(t => String(t._id) === (row ? stNameTypeId(row) : ''));
                    const isAccessory = !!rowType && String(rowType.name).trim() === ST_ACCESSORY_TYPE_NAME;
                    // แก้รหัสได้เฉพาะอุปกรณ์เสริม ประเภทอื่นแก้แค่ชื่อและคงรหัสเดิมไว้
                    if (isAccessory) {
                        stAccessoryEditDialog(id, oldName, oldCode);
                    } else {
                        showPrompt('แก้ไขชื่อสินค้า', oldName, (newName) => {
                            if (newName && newName.trim() && newName.trim() !== oldName) {
                                editMasterData(id, newName.trim(), oldCode);
                            }
                        });
                    }
                } else if (currentSettingsTab === 'supplier') {
                    stSupplierEditDialog(id, oldName, btn.dataset.limit || '');
                } else {
                    showPrompt('แก้ไขข้อมูล', oldName, (newName) => {
                        if (newName && newName.trim() !== '' && newName !== oldName) {
                            editMasterData(id, newName.trim());
                        }
                    });
                }
            });
        });

        // การลบย้อนไม่ได้ ต้องผ่าน showConfirm() และบอกว่าลบอะไร (ข้อ 11.12 ข้อ 11)
        masterDataList.querySelectorAll('.btn-delete-master').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name || '';
                showConfirm('ยืนยันการลบข้อมูล',
                    `ต้องการลบ <strong class="text-ink">${stEsc(name)}</strong> ออกจากหมวด "${stEsc(conf.label)}" ใช่หรือไม่<br><span class="text-xs text-ink/70">อาจส่งผลกระทบต่อสินค้าที่อ้างอิงข้อมูลนี้อยู่ และย้อนกลับไม่ได้</span>`,
                    () => deleteMasterData(id), 'ลบข้อมูล', 'danger');
            });
        });
    }
    window.renderSettingsList = renderSettingsList;

    // เรียกจากเมนูย่อยใน sidebar (script.js switchView 'settings') เพื่อสลับหมวด
    window.setSettingsTab = (tab) => {
        if (!ST_TABS[tab]) tab = 'productname';
        currentSettingsTab = tab;
        _stSearch = '';
        _stTypeFilter = '';
        _stStatusFilter = '';
        const s = document.getElementById('settings-search');
        if (s) s.value = '';
        if (masterDataInput) masterDataInput.value = '';
        if (masterDataCodeInput) masterDataCodeInput.value = '';
        if (masterDataColorHex) masterDataColorHex.value = '';
        if (masterDataLimitInput) masterDataLimitInput.value = '';
        renderSettingsList();
        if (tab === 'supplier') { stLoadCreditUsage(); stLoadClaimDiscounts(); }
    };

    if (masterDataTypeInput) masterDataTypeInput.addEventListener('change', stSyncCodeField);

    if (btnAddMasterData) {
        btnAddMasterData.addEventListener('click', async () => {
            const name = masterDataInput.value.trim();
            if (!name) return showToast('กรุณาระบุชื่อข้อมูลที่ต้องการเพิ่ม', 'error');

            const payload = { name };
            if (currentSettingsTab === 'supplier') {
                const lim = Number(masterDataLimitInput && masterDataLimitInput.value);
                if (!masterDataLimitInput || !masterDataLimitInput.value.trim() || !Number.isFinite(lim) || lim <= 0) {
                    return showToast('กรุณาระบุวงเงินของผู้จัดจำหน่าย (ต้องมากกว่า 0)', 'error');
                }
                payload.credit_limit = lim;
            }
            if (currentSettingsTab === 'productcolor' && masterDataColorHex) {
                const hexVal = masterDataColorHex.value.trim();
                if (hexVal && !stSixHex(hexVal)) return showToast('รหัสสีไม่ถูกต้อง ต้องเป็น hex เช่น #FF3B30', 'error');
                payload.color_code = hexVal ? stSixHex(hexVal).toUpperCase() : '';
            }
            if (currentSettingsTab === 'productname' && masterDataCodeInput) {
                const isAccessory = stIsAccessorySelected();
                payload.code = isAccessory ? masterDataCodeInput.value.trim() : '';
                if (isAccessory && !payload.code) return showToast('กรุณาระบุรหัสชื่อสินค้าของอุปกรณ์เสริม', 'error');
                payload.type_id = masterDataTypeInput && masterDataTypeInput.value ? masterDataTypeInput.value : null;
            }

            try {
                const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();

                if (result.success) {
                    masterDataInput.value = '';
                    if (masterDataCodeInput) masterDataCodeInput.value = '';
                    if (masterDataColorHex) masterDataColorHex.value = '';
                    if (masterDataLimitInput) masterDataLimitInput.value = '';
                    showToast('เพิ่มข้อมูลสำเร็จ');
                    await fetchMasterData(); // reload data & re-render
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('Error adding master data:', error);
                showToast('ไม่สามารถเพิ่มข้อมูลได้', 'error');
            }
        });
    }

    // typeId: undefined = ไม่แตะประเภท, null = ล้างประเภท, string = ตั้งประเภทใหม่
    const editMasterData = async (id, name, code, typeId, colorCode, creditLimit) => {
        try {
            const payload = { name };
            if (currentSettingsTab === 'productcolor' && colorCode !== undefined) payload.color_code = colorCode;
            if (currentSettingsTab === 'supplier' && creditLimit !== undefined) payload.credit_limit = creditLimit;
            if (currentSettingsTab === 'productname') {
                payload.code = code || '';
                if (typeId !== undefined) payload.type_id = typeId;
            }
            const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.success) {
                showToast('แก้ไขข้อมูลสำเร็จ');
                await fetchMasterData(); // reload data & re-render
            } else {
                showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error editing master data:', error);
            showToast('ไม่สามารถแก้ไขข้อมูลได้', 'error');
        }
    };

    const deleteMasterData = async (id) => {
        try {
            const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}/${id}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                showToast('ลบข้อมูลสำเร็จ');
                await fetchMasterData(); // reload data & re-render
            } else {
                showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error deleting master data:', error);
            showToast('ไม่สามารถลบข้อมูลได้', 'error');
        }
    };
})();
