// Master Data Settings Logic (การตั้งค่าระบบ)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "การตั้งค่าระบบ" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.showPrompt, window.fetchMasterData,
// window.masterDataCache, API_BASE_URL (global จาก script.js)
(function () {
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
    const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
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

    // ป้ายตัวเลขบนแท็บ นับจากข้อมูลจริงทุกหมวด
    const stUpdateTabBadges = () => {
        document.querySelectorAll('#settings-tabs .settings-tab-btn').forEach(btn => {
            const badge = btn.querySelector('.settings-tab-badge');
            if (badge) badge.textContent = stDataOf(btn.dataset.tab).length;
        });
    };

    const ST_TAB_BASE = 'elev-chip settings-tab-btn px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer';
    const ST_TAB_ON = 'bg-primary text-on-primary ring-1 ring-accent-ink apple-active-accent';
    const ST_TAB_OFF = 'elev-field bg-field text-body-muted hover:ring-1 hover:ring-accent-ink hover:text-ink';
    const ST_BADGE_ON = 'settings-tab-badge px-2 py-0.5 rounded-full text-[10px] font-bold bg-hairline/20';
    const ST_BADGE_OFF = 'settings-tab-badge px-2 py-0.5 rounded-full text-[10px] font-bold bg-chip/60 text-ink';

    const stActivateTab = (tab) => {
        document.querySelectorAll('#settings-tabs .settings-tab-btn').forEach(btn => {
            const on = btn.dataset.tab === tab;
            btn.className = `${ST_TAB_BASE} ${on ? ST_TAB_ON : ST_TAB_OFF}`;
            btn.setAttribute('aria-pressed', String(on));
            const badge = btn.querySelector('.settings-tab-badge');
            if (badge) badge.className = on ? ST_BADGE_ON : ST_BADGE_OFF;
        });
    };

    const stTypes = () => (window.masterDataCache && window.masterDataCache.productTypes) || [];
    // type_id ของชื่อสินค้าอาจเป็น string / object ที่ populate แล้ว — ดึงเป็น string id เสมอ
    const stNameTypeId = (item) => item.type_id ? String(item.type_id._id || item.type_id) : '';

    // ชิปกรองประเภท + ตัวเลือกประเภทในฟอร์มเพิ่ม (เติมใหม่ทุกครั้งที่ render เพราะประเภทอาจถูกเพิ่ม/ลบ)
    const stRenderTypeControls = () => {
        const isName = currentSettingsTab === 'productname';
        const wrap = document.getElementById('master-data-type-wrap');
        if (wrap) wrap.classList.toggle('hidden', !isName);
        const bar = document.getElementById('settings-type-filter');
        if (bar) bar.classList.toggle('hidden', !isName);
        const limitWrap = document.getElementById('master-data-limit-wrap');
        if (limitWrap) limitWrap.classList.toggle('hidden', currentSettingsTab !== 'supplier');
        const colorWrap = document.getElementById('master-data-color-wrap');
        if (colorWrap) colorWrap.classList.toggle('hidden', currentSettingsTab !== 'productcolor');
        if (!isName) return;

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

        // ช่อง "รหัสชื่อสินค้า" ใช้เฉพาะหมวดชื่อสินค้า
        const codeWrap = document.getElementById('master-data-code-wrap');
        if (codeWrap) codeWrap.classList.toggle('hidden', currentSettingsTab !== 'productname');
        if (masterDataCodeInput) masterDataCodeInput.classList.toggle('hidden', currentSettingsTab !== 'productname');

        const conf = ST_TABS[currentSettingsTab] || ST_TABS.productname;
        stSetText('settings-panel-title', '');
        const title = document.getElementById('settings-panel-title');
        if (title) title.innerHTML = `<i class="fa-solid fa-list-ul text-accent-ink"></i> ${stEsc(conf.label)}`;

        stActivateTab(currentSettingsTab);
        stUpdateTabBadges();
        stRenderChips();
        stRenderTypeControls();

        const all = stDataOf(currentSettingsTab);
        const q = _stSearch.trim().toLowerCase();
        const typeFilter = currentSettingsTab === 'productname' ? _stTypeFilter : '';
        const rows = all.filter(item => {
            if (typeFilter === 'none' && stNameTypeId(item)) return false;
            if (typeFilter && typeFilter !== 'none' && stNameTypeId(item) !== typeFilter) return false;
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
            // หมวด "สี" โชว์ตัวอย่างสีจริงด้วย เพราะหน้านี้คือที่ที่ตั้งค่าสีของเครื่อง
            // ใช้ตัวสร้างกลาง window.productColorDot() ตามข้อ 11.14 (ห้ามเขียนมาร์กอัปเอง)
            const swatch = (currentSettingsTab === 'productcolor' && typeof window.productColorDot === 'function')
                ? window.productColorDot(item.name, item)
                : '';
            const codeBadge = (currentSettingsTab === 'productname' && item.code)
                ? `<span class="px-2 py-0.5 rounded-[0.375rem] text-[10px] font-mono font-semibold bg-chip/60 text-accent-ink shrink-0">${stEsc(item.code)}</span>`
                : '';

            // ผู้จัดจำหน่าย: วงเงิน + ใช้ไปกี่ % / กี่บาท (ใช้ไป = ยอดที่ชำระจริงสะสมของ PO ที่ไม่ถูกยกเลิก)
            let creditBlock = '';
            if (currentSettingsTab === 'supplier') {
                const limit = Number(item.credit_limit);
                const hasLimit = Number.isFinite(limit) && limit > 0;
                const used = (_stCreditUsage[item.name] && _stCreditUsage[item.name].used) || 0;
                const pct = hasLimit ? (used / limit) * 100 : 0;
                const tone = !hasLimit ? 'text-body-muted' : pct >= 100 ? 'text-state-danger' : pct >= 80 ? 'text-state-pending' : 'text-state-ok';
                const bar = !hasLimit ? 'bg-body-muted' : pct >= 100 ? 'bg-state-danger' : pct >= 80 ? 'bg-state-pending' : 'bg-state-ok';
                creditBlock = hasLimit
                    ? `<div class="basis-full pt-2 mt-1 border-t border-line space-y-1.5">
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-ink/70">วงเงิน <span class="font-mono text-ink font-semibold">${stBaht(limit)}</span></span>
                            <span class="font-mono font-semibold ${tone}">${pct.toFixed(1)}%</span>
                        </div>
                        <div class="h-1.5 rounded-full bg-chip/60 overflow-hidden" role="progressbar" aria-label="วงเงินที่ใช้ไปของ ${stEsc(item.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(pct))}">
                            <div class="h-full rounded-full ${bar}" style="width:${Math.min(100, pct)}%"></div>
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-ink/70">
                            <span>ใช้ไป <span class="font-mono ${tone} font-semibold">${stBaht(used)}</span></span>
                            <span>คงเหลือ <span class="font-mono text-ink">${stBaht(Math.max(0, limit - used))}</span></span>
                        </div>
                    </div>`
                    : `<div class="basis-full pt-2 mt-1 border-t border-line text-xs text-state-pending">ยังไม่ได้ตั้งวงเงิน — กดแก้ไขเพื่อกำหนด${used > 0 ? ` (ใช้ไปแล้ว <span class="font-mono">${stBaht(used)}</span>)` : ''}</div>`;
            }

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
                <span class="text-ink font-medium truncate flex-1 min-w-0" title="${stEsc(item.name)}">${stEsc(item.name)}</span>
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
                ${creditBlock}
            </div>`;
        }).join('');

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
                    showPrompt('แก้ไขชื่อสินค้า', oldName, (newName) => {
                        if (!newName || !newName.trim()) return;
                        showPrompt('แก้ไขรหัสชื่อสินค้า (ปล่อยว่างไว้ได้)', oldCode, (newCode) => {
                            const finalName = newName.trim();
                            const finalCode = (newCode || '').trim();
                            if (finalName !== oldName || finalCode !== oldCode) {
                                editMasterData(id, finalName, finalCode);
                            }
                        });
                    });
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

    if (settingsTabBtns) {
        settingsTabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentSettingsTab = e.currentTarget.dataset.tab;
                _stSearch = '';
                _stTypeFilter = '';
                const s = document.getElementById('settings-search');
                if (s) s.value = '';
                if (masterDataInput) masterDataInput.value = '';
                if (masterDataCodeInput) masterDataCodeInput.value = '';
                if (masterDataColorHex) masterDataColorHex.value = '';
                if (masterDataLimitInput) masterDataLimitInput.value = '';
                renderSettingsList();
                if (currentSettingsTab === 'supplier') stLoadCreditUsage();
            });
        });
    }

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
                payload.code = masterDataCodeInput.value.trim();
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
