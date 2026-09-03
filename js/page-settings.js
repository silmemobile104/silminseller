// Master Data Settings Logic (การตั้งค่าระบบ)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "การตั้งค่าระบบ" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.showPrompt, window.fetchMasterData,
// window.masterDataCache, API_BASE_URL (global จาก script.js)
(function () {
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
    const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
    const masterDataInput = document.getElementById('master-data-input');
    const masterDataCodeInput = document.getElementById('master-data-code-input');
    const btnAddMasterData = document.getElementById('btn-add-master-data');
    const masterDataList = document.getElementById('master-data-list');
    let currentSettingsTab = 'productname';

    // Master Data Settings Logic
    // ---------- รายการข้อมูลพื้นฐาน (DESIGN.md ข้อ 11.3 - 11.7) ----------
    let _stSearch = '';
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
    const ST_TAB_ON = 'bg-primary text-on-primary ring-1 ring-accent-ink';
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

        const all = stDataOf(currentSettingsTab);
        const q = _stSearch.trim().toLowerCase();
        const rows = all.filter(item => !q ||
            [item.name, item.code].filter(Boolean).join(' ').toLowerCase().includes(q));

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

            return `
            <div class="elev-field bg-field rounded-xl px-4 py-3 flex items-center gap-3 hover:ring-1 hover:ring-accent-ink transition-colors">
                ${swatch}
                <span class="text-ink font-medium truncate flex-1 min-w-0" title="${stEsc(item.name)}">${stEsc(item.name)}</span>
                ${codeBadge}
                <!-- ปุ่มต้องเห็นตลอด ของเดิมหรี่ไว้ครึ่งหนึ่งแล้วค่อยชัดตอนเอาเมาส์ชี้
                     ซึ่งคนใช้คีย์บอร์ดและผู้ใช้บนมือถือเสียเปรียบ -->
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" class="btn-edit-master text-ink hover:text-amber-400 transition-colors p-1.5 cursor-pointer"
                        data-id="${stEsc(item._id)}" data-name="${stEsc(item.name)}" data-code="${stEsc(item.code || '')}"
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
                const s = document.getElementById('settings-search');
                if (s) s.value = '';
                if (masterDataInput) masterDataInput.value = '';
                if (masterDataCodeInput) masterDataCodeInput.value = '';
                renderSettingsList();
            });
        });
    }

    if (btnAddMasterData) {
        btnAddMasterData.addEventListener('click', async () => {
            const name = masterDataInput.value.trim();
            if (!name) return showToast('กรุณาระบุชื่อข้อมูลที่ต้องการเพิ่ม', 'error');

            const payload = { name };
            if (currentSettingsTab === 'productname' && masterDataCodeInput) {
                payload.code = masterDataCodeInput.value.trim();
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

    const editMasterData = async (id, name, code) => {
        try {
            const payload = { name };
            if (currentSettingsTab === 'productname') {
                payload.code = code || '';
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
