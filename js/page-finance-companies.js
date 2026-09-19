// Finance Companies (จัดการไฟแนนซ์)
// โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "จัดการไฟแนนซ์" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.fetchMasterData,
// window.masterDataCache, API_BASE_URL (global จาก script.js)
//
// ใช้ endpoint กลางของ master data (/master/financecompany) ตัวเดียวกับหน้าตั้งค่าระบบ
// จึงไม่มีทางที่รายชื่อไฟแนนซ์สองหน้าจะไม่ตรงกัน ต่างกันแค่หน้านี้แก้ commission_rate ได้ด้วย
(function () {
    const FC_COLS = 4;
    const FC_DEFAULT_RATE = 10;

    const fcSearch = document.getElementById('finance-company-search');
    const fcTableBody = document.getElementById('finance-company-table-body');
    const fcResultCount = document.getElementById('finance-company-result-count');
    const btnAddFc = document.getElementById('btn-add-finance-company');

    const fcModal = document.getElementById('modal-finance-company');
    const fcModalTitle = document.getElementById('finance-company-modal-title');
    const fcForm = document.getElementById('form-finance-company');
    const fcNameInput = document.getElementById('finance-company-name');
    const fcRateInput = document.getElementById('finance-company-rate');
    const btnFcClose = document.getElementById('btn-finance-company-close');
    const btnFcCancel = document.getElementById('btn-finance-company-cancel');
    const fcTypeRatesBox = document.getElementById('finance-company-type-rates');
    const btnFcClearRates = document.getElementById('btn-finance-company-clear-rates');

    let fcCache = [];
    let fcTypes = [];      // ประเภทสินค้าทั้งหมด — ใช้เป็นแถวในส่วน "ค่าคอมเฉพาะรายประเภทสินค้า"
    let fcEditingId = null;

    const fcEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const fcStateRow = (message, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${FC_COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ (ข้อ 11.7)
    const renderFcSkeleton = (rowCount = 5) => {
        if (!fcTableBody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `
                <tr>
                    <td class="px-6 py-4">${bar('w-40')}</td>
                    <td class="px-6 py-4"><div class="mx-auto w-16">${bar('w-16')}</div></td>
                    <td class="px-6 py-4">${bar('w-48')}</td>
                    <td class="px-6 py-4"><div class="w-16 h-8 rounded-[0.375rem] bg-skeleton animate-pulse ml-auto"></div></td>
                </tr>
            `;
        }
        fcTableBody.innerHTML = html;
    };

    // เรตของเจ้านี้ที่ตั้งเฉพาะประเภทไว้ -> Map<type_id, rate>
    const fcRateMap = (company) => {
        const map = new Map();
        const rows = (company && Array.isArray(company.commission_rates)) ? company.commission_rates : [];
        rows.forEach(r => {
            if (!r || r.type_id === undefined || r.type_id === null) return;
            const rate = Number(r.rate);
            if (Number.isFinite(rate)) map.set(String(r.type_id._id || r.type_id), rate);
        });
        return map;
    };

    const fcRowMarkup = (company) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-divider transition-colors';
        const rate = Number.isFinite(Number(company.commission_rate)) ? Number(company.commission_rate) : FC_DEFAULT_RATE;

        // เรียงชิปตามลำดับประเภทสินค้าใน master data เพื่อให้ทุกแถวเรียงเหมือนกัน
        const rateMap = fcRateMap(company);
        const overrides = fcTypes
            .filter(t => rateMap.has(String(t._id)))
            .map(t => `
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[0.375rem] bg-field text-xs text-body-muted">
                    ${fcEsc(t.name)}
                    <span class="font-mono text-ink">${rateMap.get(String(t._id))}%</span>
                </span>
            `);

        tr.innerHTML = `
            <td class="px-6 py-4">
                <p class="font-medium text-ink">${fcEsc(company.name)}</p>
            </td>
            <td class="px-6 py-4 text-center text-ink font-mono">${rate}<span class="text-xs text-ink font-normal ml-0.5">%</span></td>
            <td class="px-6 py-4 whitespace-normal">
                ${overrides.length
                ? `<div class="flex flex-wrap items-center gap-1.5">${overrides.join('')}</div>`
                : '<span class="text-body-muted">ใช้ค่าคอมเริ่มต้นทุกประเภท</span>'}
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center justify-end gap-1">
                    <button type="button" data-edit="${company._id}" title="แก้ไข" aria-label="แก้ไข ${fcEsc(company.name)}"
                        class="text-ink hover:text-accent-ink transition-colors p-2">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button type="button" data-delete="${company._id}" title="ลบ" aria-label="ลบ ${fcEsc(company.name)}"
                        class="text-ink hover:text-red-400 transition-colors p-2">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        return tr;
    };

    const renderFcResults = () => {
        if (!fcTableBody) return;

        const term = (fcSearch && fcSearch.value || '').trim().toLowerCase();
        const rows = term
            ? fcCache.filter(c => String(c.name || '').toLowerCase().includes(term))
            : fcCache;

        if (rows.length === 0) {
            fcTableBody.innerHTML = fcStateRow(term ? 'ไม่พบบริษัทไฟแนนซ์ที่ค้นหา' : 'ยังไม่มีบริษัทไฟแนนซ์ในระบบ');
            if (fcResultCount) fcResultCount.textContent = '';
            return;
        }

        const frag = document.createDocumentFragment();
        rows.forEach(c => frag.appendChild(fcRowMarkup(c)));
        fcTableBody.innerHTML = '';
        fcTableBody.appendChild(frag);
        if (fcResultCount) fcResultCount.textContent = `แสดง ${rows.length} จาก ${fcCache.length} รายการ`;
    };

    async function loadFinanceCompanies() {
        if (!fcTableBody) return;
        renderFcSkeleton();

        try {
            const response = await authFetch(`${API_BASE_URL}/master-data`);
            const result = await response.json();

            if (!result.success) {
                fcCache = [];
                fcTableBody.innerHTML = fcStateRow(fcEsc(result.message || 'ไม่สามารถโหลดข้อมูลได้'), 'text-red-400');
                return;
            }

            fcCache = (result.data && result.data.financeCompanies) || [];
            fcCache.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
            fcTypes = ((result.data && result.data.productTypes) || [])
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
            renderFcResults();
        } catch (err) {
            console.error('[FINANCE-COMPANIES] Error loading finance companies:', err);
            fcCache = [];
            fcTableBody.innerHTML = fcStateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
        }
    }
    window.loadFinanceCompanies = loadFinanceCompanies;

    // ==========================================
    // โมดัลเพิ่ม / แก้ไข
    // ==========================================
    // แถวเรตรายประเภท — ช่องว่าง = ประเภทนั้นไม่ตั้งเรตเฉพาะ ให้ตกไปใช้ค่าคอมเริ่มต้นของเจ้านั้น
    // placeholder จึงโชว์ค่าเริ่มต้นปัจจุบัน เพื่อให้เห็นว่าเว้นว่างแล้วจะได้เรตเท่าไร
    const renderFcTypeRates = (company = null) => {
        if (!fcTypeRatesBox) return;

        if (fcTypes.length === 0) {
            fcTypeRatesBox.innerHTML = '<p class="text-xs text-body-muted italic py-2">ยังไม่มีประเภทสินค้าในระบบ</p>';
            return;
        }

        const rateMap = fcRateMap(company);
        fcTypeRatesBox.innerHTML = fcTypes.map(t => {
            const id = String(t._id);
            const value = rateMap.has(id) ? rateMap.get(id) : '';
            return `
                <div class="flex items-center gap-3">
                    <label for="fc-type-rate-${fcEsc(id)}" class="flex-1 min-w-0 text-ink text-sm truncate">${fcEsc(t.name)}</label>
                    <div class="relative w-28 shrink-0">
                        <input type="number" id="fc-type-rate-${fcEsc(id)}" data-type-id="${fcEsc(id)}"
                            inputmode="decimal" min="0" max="100" step="0.01" value="${value}"
                            class="w-full pl-3 pr-8 py-2 rounded-xl bg-field border border-line-strong text-ink text-sm text-right font-mono focus:border-accent-ink focus:outline-none transition-all placeholder-body-muted">
                        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-body-muted pointer-events-none">%</span>
                    </div>
                </div>
            `;
        }).join('');

        syncFcTypeRatePlaceholders();
    };

    // ค่าเริ่มต้นเปลี่ยน -> placeholder ของทุกแถวต้องเปลี่ยนตาม ไม่งั้นจะอ่านว่าเว้นว่างแล้วได้เรตเก่า
    function syncFcTypeRatePlaceholders() {
        if (!fcTypeRatesBox) return;
        const base = fcRateInput && Number.isFinite(Number(fcRateInput.value))
            ? Number(fcRateInput.value)
            : FC_DEFAULT_RATE;
        fcTypeRatesBox.querySelectorAll('input[data-type-id]').forEach(input => {
            input.placeholder = String(base);
        });
    }

    // อ่านเฉพาะแถวที่กรอกไว้ — แถวว่างไม่ถูกส่งไป เซิร์ฟเวอร์จึงลบเรตเฉพาะของประเภทนั้นให้เอง
    const collectFcTypeRates = () => {
        if (!fcTypeRatesBox) return [];
        return Array.from(fcTypeRatesBox.querySelectorAll('input[data-type-id]'))
            .filter(input => input.value.trim() !== '')
            .map(input => ({ type_id: input.dataset.typeId, rate: Number(input.value) }));
    };

    const openFcModal = (company = null) => {
        if (!fcModal) return;
        fcEditingId = company ? company._id : null;

        if (fcModalTitle) {
            fcModalTitle.innerHTML = company
                ? '<i class="fa-solid fa-hand-holding-dollar text-accent-ink"></i> แก้ไขบริษัทไฟแนนซ์'
                : '<i class="fa-solid fa-hand-holding-dollar text-accent-ink"></i> เพิ่มบริษัทไฟแนนซ์';
        }
        if (fcNameInput) fcNameInput.value = company ? (company.name || '') : '';
        if (fcRateInput) {
            const rate = company && Number.isFinite(Number(company.commission_rate)) ? Number(company.commission_rate) : FC_DEFAULT_RATE;
            fcRateInput.value = rate;
        }
        renderFcTypeRates(company);

        fcModal.classList.remove('opacity-0', 'pointer-events-none');
        const content = fcModal.querySelector('.modal-content');
        if (content) content.classList.remove('scale-95');
        if (fcNameInput) fcNameInput.focus();
    };

    const closeFcModal = () => {
        if (!fcModal) return;
        fcModal.classList.add('opacity-0', 'pointer-events-none');
        const content = fcModal.querySelector('.modal-content');
        if (content) content.classList.add('scale-95');
        fcEditingId = null;
    };

    async function submitFinanceCompany(e) {
        e.preventDefault();

        const name = fcNameInput ? fcNameInput.value.trim() : '';
        const rate = fcRateInput ? Number(fcRateInput.value) : FC_DEFAULT_RATE;
        const typeRates = collectFcTypeRates();

        if (!name) {
            showToast('กรุณาระบุชื่อบริษัทไฟแนนซ์', 'error');
            return;
        }
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
            showToast('เปอร์เซ็นค่าคอมต้องอยู่ระหว่าง 0 - 100', 'error');
            return;
        }

        const badRate = typeRates.find(r => !Number.isFinite(r.rate) || r.rate < 0 || r.rate > 100);
        if (badRate) {
            const typeDoc = fcTypes.find(t => String(t._id) === String(badRate.type_id));
            showToast(`เปอร์เซ็นค่าคอมของ "${typeDoc ? typeDoc.name : 'ประเภทสินค้า'}" ต้องอยู่ระหว่าง 0 - 100`, 'error');
            return;
        }

        const url = fcEditingId
            ? `${API_BASE_URL}/master/financecompany/${fcEditingId}`
            : `${API_BASE_URL}/master/financecompany`;

        try {
            const response = await authFetch(url, {
                method: fcEditingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, commission_rate: rate, commission_rates: typeRates })
            });
            const result = await response.json();

            if (!result.success) {
                showToast(result.message || 'บันทึกไม่สำเร็จ', 'error');
                return;
            }

            showToast(fcEditingId ? 'แก้ไขบริษัทไฟแนนซ์แล้ว' : 'เพิ่มบริษัทไฟแนนซ์แล้ว');
            closeFcModal();
            // แคช master data ฝั่งหน้าเว็บถือรายชื่อไฟแนนซ์ไว้ด้วย (POS ใช้ตอนเลือกไฟแนนซ์) ต้องรีเฟรชตาม
            if (typeof fetchMasterData === 'function') await fetchMasterData();
            await loadFinanceCompanies();
        } catch (err) {
            console.error('[FINANCE-COMPANIES] Error saving finance company:', err);
            showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
        }
    }

    // การลบเป็นการกระทำที่ย้อนไม่ได้ ต้องผ่าน showConfirm เสมอ (ข้อ 11.12)
    function deleteFinanceCompany(company) {
        showConfirm(
            'ยืนยันลบบริษัทไฟแนนซ์',
            `ต้องการลบ <strong>${fcEsc(company.name)}</strong> ออกจากระบบใช่ไหม? บิลเก่าที่ผูกกับไฟแนนซ์เจ้านี้จะกลับไปใช้ค่าคอมเริ่มต้น 10%`,
            async () => {
                try {
                    const response = await authFetch(`${API_BASE_URL}/master/financecompany/${company._id}`, {
                        method: 'DELETE'
                    });
                    const result = await response.json();

                    if (!result.success) {
                        showToast(result.message || 'ลบไม่สำเร็จ', 'error');
                        return;
                    }

                    showToast('ลบบริษัทไฟแนนซ์แล้ว');
                    if (typeof fetchMasterData === 'function') await fetchMasterData();
                    await loadFinanceCompanies();
                } catch (err) {
                    console.error('[FINANCE-COMPANIES] Error deleting finance company:', err);
                    showToast('เกิดข้อผิดพลาดในการลบ', 'error');
                }
            },
            'ลบ'
        );
    }

    // ==========================================
    // ผูก event
    // ==========================================
    if (fcSearch) {
        let searchTimeout;
        fcSearch.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(renderFcResults, 200);
        });
    }

    if (fcRateInput) fcRateInput.addEventListener('input', syncFcTypeRatePlaceholders);
    if (btnFcClearRates) {
        btnFcClearRates.addEventListener('click', () => {
            if (!fcTypeRatesBox) return;
            fcTypeRatesBox.querySelectorAll('input[data-type-id]').forEach(input => { input.value = ''; });
        });
    }

    if (btnAddFc) btnAddFc.addEventListener('click', () => openFcModal(null));
    if (btnFcClose) btnFcClose.addEventListener('click', closeFcModal);
    if (btnFcCancel) btnFcCancel.addEventListener('click', closeFcModal);
    if (fcForm) fcForm.addEventListener('submit', submitFinanceCompany);
    if (fcModal) {
        fcModal.addEventListener('click', (e) => {
            if (e.target === fcModal) closeFcModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (fcModal && !fcModal.classList.contains('pointer-events-none')) closeFcModal();
    });

    // แถวถูกสร้างใหม่ทุกครั้งที่โหลด จึงดักที่ tbody ครั้งเดียวแทนการผูกทีละปุ่ม
    if (fcTableBody) {
        fcTableBody.addEventListener('click', (e) => {
            const editBtn = e.target.closest('[data-edit]');
            if (editBtn) {
                const company = fcCache.find(c => String(c._id) === String(editBtn.dataset.edit));
                if (company) openFcModal(company);
                return;
            }

            const deleteBtn = e.target.closest('[data-delete]');
            if (deleteBtn) {
                const company = fcCache.find(c => String(c._id) === String(deleteBtn.dataset.delete));
                if (company) deleteFinanceCompany(company);
            }
        });
    }
})();
