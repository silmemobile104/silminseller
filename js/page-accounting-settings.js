// COA Settings & Disbursement Voucher Modules
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ตั้งค่าผังบัญชี" หรือ "ใบสำคัญจ่าย" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, API_BASE_URL (global จาก script.js)
(function () {
    // --- COA Settings & Disbursement Voucher Modules ---

    // Escapes user-controllable text (payee names, remarks, account names, etc.) before
    // it is interpolated into innerHTML / document.write templates below, to prevent
    // stored XSS via fields like payee_name or remark on the disbursement voucher.
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Unwraps a Mongoose-populated reference field back to its plain id string
    // (fields like category_id/group_id come populated from some endpoints, as
    // a raw id string from others).
    function idOf(field) {
        return field && typeof field === 'object' ? field._id : field;
    }

    // Fills a <select> with a placeholder option plus one <option> per COA category.
    function populateCategorySelect(selectEl, placeholder) {
        if (!selectEl) return;
        selectEl.innerHTML = `<option value="">${placeholder}</option>`;
        _coaCache.categories.forEach(c => {
            selectEl.innerHTML += `<option value="${c._id}">${c.category_name}</option>`;
        });
    }

    let _coaCache = { categories: [], groups: [], accounts: [] };

    function thaiBahtText(number) {
        if (isNaN(number)) return '';
        number = Math.round(number * 100) / 100;
        const parts = number.toString().split('.');
        const bahtStr = parts[0];
        const satangStr = parts[1];

        let bahtText = '';
        if (parseInt(bahtStr) === 0 && (!satangStr || parseInt(satangStr) === 0)) {
            return 'ศูนย์บาทถ้วน';
        }

        if (parseInt(bahtStr) > 0) {
            bahtText = convertSegment(bahtStr) + 'บาท';
        }

        let satangText = '';
        if (satangStr && parseInt(satangStr) > 0) {
            let satangNum = parseInt(satangStr);
            if (satangStr.length === 1) satangNum *= 10;
            satangText = convertSegment(satangNum.toString()) + 'สตางค์';
        } else if (parseInt(bahtStr) > 0) {
            satangText = 'ถ้วน';
        }

        return bahtText + satangText;
    }

    function convertSegment(numberStr) {
        const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
        const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
        let text = '';
        const length = numberStr.length;

        if (length > 6) {
            const millionPos = length - 6;
            const millionStr = numberStr.substring(0, millionPos);
            const remainStr = numberStr.substring(millionPos);
            return convertSegment(millionStr) + 'ล้าน' + convertSegment(remainStr);
        }

        for (let i = 0; i < length; i++) {
            const digit = parseInt(numberStr[i]);
            const pos = length - i - 1;

            if (digit !== 0) {
                if (pos === 1 && digit === 1) {
                    text += 'สิบ';
                } else if (pos === 1 && digit === 2) {
                    text += 'ยี่สิบ';
                } else if (pos === 0 && digit === 1 && length > 1) {
                    text += 'เอ็ด';
                } else {
                    text += digits[digit] + units[pos];
                }
            }
        }
        return text;
    }

    async function initAccountingSettings() {
        await loadCOAData();
        switchCOATab('accounts');
    }

    async function loadCOAData() {
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/chart-of-accounts`);
            const data = await res.json();
            if (data.success) {
                _coaCache = {
                    categories: data.categories || [],
                    groups: data.groups || [],
                    accounts: data.accounts || []
                };

                // Populate filters
                populateCategorySelect(document.getElementById('coa-filter-category'), 'ทุกหมวดหมู่');

                renderCOATable(_coaCache.accounts);
                renderCOAGroupsTable(_coaCache.groups);
            } else {
                showToast(data.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลผังบัญชี', 'error');
            }
        } catch (error) {
            console.error('Error loadCOAData:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'error');
        }
    }

    function renderCOATable(accountsToRender) {
        const tbody = document.getElementById('coa-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (!accountsToRender || accountsToRender.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-body-muted py-4">ไม่พบข้อมูล</td></tr>';
            return;
        }

        accountsToRender.forEach(acc => {
            const accCatId = idOf(acc.category_id);
            const accGrpId = idOf(acc.group_id);
            const cat = _coaCache.categories.find(c => c._id === accCatId) || {};
            const grp = _coaCache.groups.find(g => g._id === accGrpId) || {};

            const tr = document.createElement('tr');
            tr.className = 'border-b border-hairline hover:bg-surface-chip/40 text-ink';
            tr.innerHTML = `
                <td class="px-4 py-3 font-mono">${escapeHtml(acc.account_code)}</td>
                <td class="px-4 py-3">${escapeHtml(acc.account_name)}</td>
                <td class="px-4 py-3">${escapeHtml(cat.category_name) || '-'}</td>
                <td class="px-4 py-3">${escapeHtml(grp.group_name) || '-'}</td>
                <td class="px-4 py-3 text-center">${acc.level || ''}</td>
                <td class="px-4 py-3 text-center">
                    ${acc.is_system ? '<span class="bg-surface-chip text-body-muted text-xs px-2 py-0.5 rounded-md font-semibold">ระบบ</span>' : ''}
                </td>
                <td class="px-4 py-3 text-center space-x-2">
                    ${!acc.is_system ? `
                    <button type="button" class="text-body-muted hover:text-primary transition-colors" onclick="editAccountChart('${acc._id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="text-rose-400 hover:text-rose-300 transition-colors" onclick="deleteAccountChart('${acc._id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : '-'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function filterCOATable() {
        const searchTxt = (document.getElementById('coa-search')?.value || '').toLowerCase();
        const catId = document.getElementById('coa-filter-category')?.value || '';

        const filtered = _coaCache.accounts.filter(acc => {
            const matchSearch = (acc.account_code || '').toLowerCase().includes(searchTxt) ||
                (acc.account_name || '').toLowerCase().includes(searchTxt);
            const accCatId = idOf(acc.category_id);
            const matchCat = catId ? accCatId === catId : true;
            return matchSearch && matchCat;
        });

        renderCOATable(filtered);
    }

    function renderCOAGroupsTable(groups) {
        const tbody = document.getElementById('coa-groups-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (!groups || groups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-body-muted py-4">ไม่พบข้อมูล</td></tr>';
            return;
        }

        groups.forEach(grp => {
            const grpCatId = idOf(grp.category_id);
            const cat = _coaCache.categories.find(c => c._id === grpCatId) || {};
            const accCount = _coaCache.accounts.filter(a => {
                const gId = idOf(a.group_id);
                return gId === grp._id;
            }).length;

            const tr = document.createElement('tr');
            tr.className = 'border-b border-hairline hover:bg-surface-chip/40 text-ink';
            tr.innerHTML = `
                <td class="px-4 py-3 font-mono">${escapeHtml(grp.group_code)}</td>
                <td class="px-4 py-3">${escapeHtml(grp.group_name)}</td>
                <td class="px-4 py-3">${escapeHtml(cat.category_name) || '-'}</td>
                <td class="px-4 py-3 text-center font-bold text-ink">${accCount}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function switchCOATab(tabName) {
        ['accounts', 'groups', 'pnl'].forEach(t => {
            const btn = document.getElementById(`coa-tab-${t}`);
            const content = document.getElementById(`coa-content-${t}`);
            if (btn) {
                if (t === tabName) {
                    btn.className = "px-4 py-2.5 text-sm font-medium rounded-t-lg bg-surface-tile-3 text-ink border-b-2 border-primary";
                } else {
                    btn.className = "px-4 py-2.5 text-sm font-medium rounded-t-lg text-body-muted hover:text-ink hover:bg-surface-chip/40 transition-all";
                }
            }
            if (content) {
                content.classList.toggle('hidden', t !== tabName);
            }
        });

        if (tabName === 'pnl') {
            loadPnLConfig();
        }
    }

    function openAddAccountModal(editData = null) {
        const modal = document.getElementById('modal-add-account');
        if (!modal) return;

        const catSelect = document.getElementById('modal-account-category');
        populateCategorySelect(catSelect, '-- เลือกหมวดหมู่ --');

        if (editData) {
            document.getElementById('modal-account-title').textContent = 'แก้ไขบัญชี';
            document.getElementById('modal-account-id').value = editData._id || '';
            document.getElementById('modal-account-code').value = editData.account_code || '';
            document.getElementById('modal-account-name').value = editData.account_name || '';

            const catId = idOf(editData.category_id);
            if (catSelect) catSelect.value = catId || '';

            onAccountCategoryChange();

            const grpSelect = document.getElementById('modal-account-group');
            if (grpSelect) {
                const grpId = idOf(editData.group_id);
                grpSelect.value = grpId || '';
            }
            document.getElementById('modal-account-level').value = editData.level || 3;
        } else {
            document.getElementById('modal-account-title').textContent = 'เพิ่มบัญชีใหม่';
            document.getElementById('modal-account-id').value = '';
            document.getElementById('modal-account-code').value = '';
            document.getElementById('modal-account-name').value = '';
            if (catSelect) catSelect.value = '';
            onAccountCategoryChange();
            document.getElementById('modal-account-level').value = 3;
        }

        modal.classList.remove('hidden');
    }

    function closeAddAccountModal() {
        const modal = document.getElementById('modal-add-account');
        if (modal) modal.classList.add('hidden');
    }

    function onAccountCategoryChange() {
        const catId = document.getElementById('modal-account-category')?.value;
        const grpSelect = document.getElementById('modal-account-group');
        if (!grpSelect) return;

        grpSelect.innerHTML = '<option value="">-- เลือกกลุ่ม --</option>';
        if (catId) {
            const groups = _coaCache.groups.filter(g => {
                const id = idOf(g.category_id);
                return id === catId;
            });
            groups.forEach(g => {
                grpSelect.innerHTML += `<option value="${g._id}">${g.group_name}</option>`;
            });
        }
    }

    async function saveAccountChart() {
        const _id = document.getElementById('modal-account-id')?.value;
        const payload = {
            account_code: document.getElementById('modal-account-code')?.value,
            account_name: document.getElementById('modal-account-name')?.value,
            category_id: document.getElementById('modal-account-category')?.value,
            group_id: document.getElementById('modal-account-group')?.value,
            level: parseInt(document.getElementById('modal-account-level')?.value || 3)
        };
        if (_id) payload._id = _id;

        if (!payload.account_code || !payload.account_name || !payload.category_id || !payload.group_id) {
            showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'warning');
            return;
        }

        try {
            const res = await authFetch(`${API_BASE_URL}/acct/chart-of-accounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('บันทึกข้อมูลเรียบร้อย', 'success');
                closeAddAccountModal();
                loadCOAData();
            } else {
                showToast('บันทึกข้อมูลผังบัญชีไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error saveAccountChart:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
    }

    function editAccountChart(id) {
        const acc = _coaCache.accounts.find(a => a._id === id);
        if (acc) {
            openAddAccountModal(acc);
        }
    }

    async function deleteAccountChart(id) {
        if (!confirm('ยืนยันการลบบัญชีนี้?')) return;

        try {
            const res = await authFetch(`${API_BASE_URL}/acct/chart-of-accounts/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast('ลบข้อมูลเรียบร้อย', 'success');
                loadCOAData();
            } else {
                showToast('ลบข้อมูลผังบัญชีไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error deleteAccountChart:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
    }

    function openAddGroupModal() {
        const modal = document.getElementById('modal-add-group');
        if (!modal) return;

        populateCategorySelect(document.getElementById('modal-group-category'), '-- เลือกหมวดหมู่ --');

        document.getElementById('modal-group-code').value = '';
        document.getElementById('modal-group-name').value = '';
        modal.classList.remove('hidden');
    }

    function closeAddGroupModal() {
        const modal = document.getElementById('modal-add-group');
        if (modal) modal.classList.add('hidden');
    }

    function onGroupCategoryChange() {
        const catId = document.getElementById('modal-group-category')?.value;
        const codeInput = document.getElementById('modal-group-code');
        if (!codeInput) return;

        if (!catId) {
            codeInput.value = '';
            return;
        }

        const cat = _coaCache.categories.find(c => c._id === catId);
        if (!cat) {
            codeInput.value = '';
            return;
        }

        const catCode = cat.category_code;

        // Find existing groups under this category
        const siblingGroups = _coaCache.groups.filter(g => {
            const id = idOf(g.category_id);
            return id === catId;
        });

        let nextNumber = 1;
        if (siblingGroups.length > 0) {
            const codes = siblingGroups.map(g => {
                const codeStr = g.group_code || '';
                if (codeStr.startsWith(catCode)) {
                    // Extract numerical suffix (e.g. if codeStr is "11" and catCode is "1", then suffix is "1")
                    const num = parseInt(codeStr.substring(catCode.length));
                    return isNaN(num) ? 0 : num;
                }
                return 0;
            });
            nextNumber = Math.max(...codes) + 1;
        }

        codeInput.value = `${catCode}${nextNumber}`;
    }

    async function saveAccountGroup() {
        const payload = {
            group_code: document.getElementById('modal-group-code')?.value,
            group_name: document.getElementById('modal-group-name')?.value,
            category_id: document.getElementById('modal-group-category')?.value
        };

        if (!payload.group_code || !payload.group_name || !payload.category_id) {
            showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
            return;
        }

        try {
            const res = await authFetch(`${API_BASE_URL}/acct/account-groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('บันทึกข้อมูลเรียบร้อย', 'success');
                closeAddGroupModal();
                loadCOAData();
            } else {
                showToast('บันทึกข้อมูลกลุ่มบัญชีไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error saveAccountGroup:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
    }

    async function loadPnLConfig() {
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/pnl-config`);
            const data = await res.json();
            if (data.success) {
                renderPnLConfigTable(data.configs || []);
            } else {
                showToast(data.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลโครงสร้างงบ', 'error');
            }
        } catch (error) {
            console.error('Error loadPnLConfig:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'error');
        }
    }

    function renderPnLConfigTable(configs) {
        const tbody = document.getElementById('pnl-config-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        configs.forEach((conf, idx) => {
            const tr = createPnLRow(conf, idx);
            tbody.appendChild(tr);
        });
    }

    function createPnLRow(conf = {}, idx = 0) {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-hairline hover:bg-surface-chip/40 pnl-row';

        let accOptions = '<option value="">เลือกบัญชี (ออโต้รวม)</option>';
        _coaCache.accounts.forEach(a => {
            const isSelected = conf.account_ids && conf.account_ids.some(acc => {
                const id = typeof acc === 'object' ? acc._id : acc;
                return id === a._id;
            });
            const sel = isSelected ? 'selected' : '';
            accOptions += `<option value="${a._id}" ${sel}>${a.account_code} - ${a.account_name}</option>`;
        });

        const sections = [
            { value: 'revenue', label: 'รายได้' },
            { value: 'expense', label: 'ค่าใช้จ่าย' }
        ];
        let secOptions = '';
        sections.forEach(s => {
            const sel = s.value === conf.section ? 'selected' : '';
            secOptions += `<option value="${s.value}" ${sel}>${s.label}</option>`;
        });

        tr.innerHTML = `
            <td class="px-4 py-2">
                <input type="number" class="pnl-sort w-16 bg-surface-chip border border-divider-soft rounded-sm p-1 text-ink text-center font-mono text-sm" value="${conf.sort_order ?? (idx + 1) * 10}">
            </td>
            <td class="px-4 py-2">
                <input type="text" class="pnl-name w-full bg-surface-chip border border-divider-soft rounded-sm p-1 text-ink text-sm" value="${conf.display_name || ''}" placeholder="ชื่อรายการ">
            </td>
            <td class="px-4 py-2">
                <select class="pnl-section w-full bg-surface-chip border border-divider-soft rounded-sm p-1 text-ink text-sm">
                    ${secOptions}
                </select>
            </td>
            <td class="px-4 py-2">
                <select class="pnl-account w-full bg-surface-chip border border-divider-soft rounded-sm p-1 text-ink text-sm">
                    ${accOptions}
                </select>
            </td>
            <td class="px-4 py-2 text-center">
                <input type="checkbox" class="pnl-bold w-4 h-4 rounded border-divider-soft bg-surface-chip text-primary focus:ring-primary-focus" ${conf.is_bold ? 'checked' : ''}>
            </td>
            <td class="px-4 py-2 text-center">
                <button type="button" class="text-rose-400 hover:text-rose-300 transition-colors" onclick="removePnLLine(this)">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        return tr;
    }

    function addPnLLine() {
        const tbody = document.getElementById('pnl-config-table-body');
        if (!tbody) return;

        const tr = createPnLRow({}, tbody.children.length);
        tbody.appendChild(tr);
    }

    function removePnLLine(btn) {
        if (confirm('ลบรายการนี้?')) {
            const tr = btn.closest('tr');
            if (tr) tr.remove();
        }
    }

    async function savePnLConfig() {
        const rows = document.querySelectorAll('.pnl-row');
        const lines = [];

        rows.forEach(tr => {
            const accId = tr.querySelector('.pnl-account')?.value;
            lines.push({
                sort_order: parseInt(tr.querySelector('.pnl-sort')?.value || 0),
                display_name: tr.querySelector('.pnl-name')?.value || '',
                section: tr.querySelector('.pnl-section')?.value || '',
                account_id: accId || null,
                account_ids: accId ? [accId] : [],
                is_bold: tr.querySelector('.pnl-bold')?.checked || false
            });
        });

        lines.sort((a, b) => a.sort_order - b.sort_order);

        try {
            const res = await authFetch(`${API_BASE_URL}/acct/pnl-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lines })
            });
            const data = await res.json();
            if (data.success) {
                showToast('บันทึกโครงสร้างงบเรียบร้อย', 'success');
                loadPnLConfig();
            } else {
                showToast('บันทึกโครงสร้างงบไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error savePnLConfig:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
    }

    async function initDisbursement() {
        // Use local date parts (not toISOString, which is UTC) — in ICT (UTC+7) a plain
        // toISOString().split('T')[0] resolves to "yesterday" for any local time before
        // 07:00, defaulting the voucher/filter dates a day early.
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const dateInput = document.getElementById('dv-payment-date');
        if (dateInput) dateInput.value = today;

        const startInput = document.getElementById('dv-filter-start');
        const endInput = document.getElementById('dv-filter-end');
        if (startInput) startInput.value = today;
        if (endInput) endInput.value = today;

        await loadDisbursementAccounts();
        loadDisbursements();
    }

    async function loadDisbursementAccounts() {
        if (!_coaCache.accounts || _coaCache.accounts.length === 0) {
            try {
                const res = await authFetch(`${API_BASE_URL}/acct/chart-of-accounts`);
                const data = await res.json();
                if (data.success) {
                    _coaCache.accounts = data.accounts || [];
                }
            } catch (err) {
                console.error('Error fetch for dv accounts:', err);
            }
        }

        const debitSelect = document.getElementById('dv-debit-account');
        const creditSelect = document.getElementById('dv-credit-account');

        if (debitSelect) {
            let debitOpts = '<option value="">-- เลือกบัญชีเดบิต --</option>';
            // Debit: strictly Expense (5xxxxx) and Liabilities/AP (2xxxxx)
            const debits = _coaCache.accounts.filter(a => (a.account_code.startsWith('2') || a.account_code.startsWith('5')) && a.level === 3);
            debits.forEach(a => {
                debitOpts += `<option value="${a._id}">${a.account_code} - ${a.account_name}</option>`;
            });
            debitSelect.innerHTML = debitOpts;
        }

        if (creditSelect) {
            let creditOpts = '<option value="">-- เลือกบัญชีเครดิต --</option>';
            // Credit: strictly Liquid Assets (11xxxx)
            const credits = _coaCache.accounts.filter(a => a.account_code.startsWith('11') && a.level === 3);
            credits.forEach(a => {
                creditOpts += `<option value="${a._id}">${a.account_code} - ${a.account_name}</option>`;
            });
            creditSelect.innerHTML = creditOpts;
        }
    }

    function calcDVVat() {
        const amount = parseFloat(document.getElementById('dv-amount')?.value || 0);
        const vatType = document.getElementById('dv-vat-type')?.value || 'NO_VAT';

        let net = 0;
        let vat = 0;
        let total = 0;
        let showVat = false;

        if (vatType === 'VAT_INCLUDED') {
            net = amount * 100 / 107;
            vat = amount - net;
            total = amount;
            showVat = true;
        } else if (vatType === 'VAT_EXCLUDED') {
            net = amount;
            vat = amount * 0.07;
            total = amount + vat;
            showVat = true;
        } else {
            net = amount;
            vat = 0;
            total = amount;
            showVat = false;
        }

        const summary = document.getElementById('dv-vat-summary');
        if (summary) summary.classList.toggle('hidden', !showVat);

        const netDisp = document.getElementById('dv-net-display');
        const vatDisp = document.getElementById('dv-vat-display');
        const totDisp = document.getElementById('dv-total-display');

        if (netDisp) netDisp.textContent = '฿' + net.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (vatDisp) vatDisp.textContent = '฿' + vat.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (totDisp) totDisp.textContent = '฿' + total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    async function submitDisbursement() {
        const fileInput = document.getElementById('dv-proof-image');
        let proofImageBase64 = '';

        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            proofImageBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
        }

        const payload = {
            payment_date: document.getElementById('dv-payment-date')?.value,
            debit_account_id: document.getElementById('dv-debit-account')?.value,
            credit_account_id: document.getElementById('dv-credit-account')?.value,
            amount: parseFloat(document.getElementById('dv-amount')?.value || 0),
            vat_type: document.getElementById('dv-vat-type')?.value,
            payee_name: document.getElementById('dv-payee')?.value,
            remark: document.getElementById('dv-remark')?.value,
            proof_image_base64: proofImageBase64
        };

        if (!payload.payment_date || !payload.debit_account_id || !payload.credit_account_id || payload.amount <= 0 || !payload.payee_name) {
            showToast('กรุณากรอกข้อมูลสำคัญให้ครบ (วันที่, บัญชีเดบิต/เครดิต, ยอดเงิน, ผู้รับเงิน)', 'warning');
            return;
        }

        try {
            const res = await authFetch(`${API_BASE_URL}/acct/disbursements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('บันทึกใบสำคัญจ่ายเรียบร้อย', 'success');
                // Reset form
                document.getElementById('dv-debit-account').value = '';
                document.getElementById('dv-credit-account').value = '';
                document.getElementById('dv-amount').value = '';
                document.getElementById('dv-vat-type').value = 'NO_VAT';
                document.getElementById('dv-payee').value = '';
                document.getElementById('dv-remark').value = '';
                if (fileInput) fileInput.value = '';
                calcDVVat();
                loadDisbursements();
            } else {
                showToast('บันทึกใบสำคัญจ่ายไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error submitDisbursement:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
    }

    async function loadDisbursements() {
        const start = document.getElementById('dv-filter-start')?.value || '';
        const end = document.getElementById('dv-filter-end')?.value || '';

        try {
            let url = `${API_BASE_URL}/acct/disbursements`;
            if (start || end) {
                url += `?startDate=${start}&endDate=${end}`;
            }

            const res = await authFetch(url);
            const data = await res.json();

            const tbody = document.getElementById('dv-history-table-body');
            if (!tbody) return;

            tbody.innerHTML = '';
            if (!data.success || !data.vouchers || data.vouchers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-body-muted py-4">ไม่พบข้อมูล</td></tr>';
                return;
            }

            data.vouchers.forEach(v => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-hairline hover:bg-surface-chip/40';

                const dt = new Date(v.payment_date).toLocaleDateString('th-TH');
                const amt = (v.total_amount || v.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

                tr.innerHTML = `
                    <td class="px-4 py-2.5 font-mono font-bold text-ink">${escapeHtml(v.voucher_no) || '-'}</td>
                    <td class="px-4 py-2.5 font-mono">${dt}</td>
                    <td class="px-4 py-2.5 font-semibold text-ink">${escapeHtml(v.payee_name) || '-'}</td>
                    <td class="px-4 py-2.5 text-xs text-body-muted">${escapeHtml(v.debit_account_id?.account_code) || '-'} - ${escapeHtml(v.debit_account_id?.account_name) || '-'}</td>
                    <td class="px-4 py-2.5 text-xs text-body-muted">${escapeHtml(v.credit_account_id?.account_code) || '-'} - ${escapeHtml(v.credit_account_id?.account_name) || '-'}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">฿${amt}</td>
                    <td class="px-4 py-2.5 text-center">
                        <button type="button" class="text-body-muted hover:text-primary transition-colors" onclick="printDisbursementVoucher('${v._id}')">
                            <i class="fas fa-print"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            console.error('Error loadDisbursements:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'error');
        }
    }

    async function printDisbursementVoucher(id) {
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/disbursements/${id}`);
            const data = await res.json();

            if (data.success && data.voucher) {
                const v = data.voucher;
                const printWindow = window.open('', '_blank');

                // Double entry booking layout values
                const debitAmt = v.net_amount || v.amount;
                const creditAmt = v.total_amount || v.amount;

                let vatRowHtml = '';
                if (v.vat_type !== 'NO_VAT' && v.vat_amount > 0) {
                    vatRowHtml = `
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace;">210201</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">ภาษีมูลค่าเพิ่มค้างจ่าย (Voucher VAT)</td>
                            <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${v.vat_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                            <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-family: monospace;">-</td>
                        </tr>
                    `;
                }

                const thaiWords = thaiBahtText(creditAmt);

                let proofImageHtml = '';
                if (v.proof_image_url) {
                    proofImageHtml = `
                        <div style="margin-top: 40px; border: 1px dashed #bbb; padding: 15px; border-radius: 8px; page-break-inside: avoid;">
                            <h4 style="margin: 0 0 10px 0; color: #555;">หลักฐานการชำระเงิน (Proof of Payment)</h4>
                            <img src="${escapeHtml(v.proof_image_url)}" style="max-width: 100%; max-height: 350px; display: block; margin: 0 auto; border-radius: 6px; border: 1px solid #eee;">
                        </div>
                    `;
                }

                const html = `
                    <html>
                    <head>
                        <title>ใบสำคัญจ่าย - ${escapeHtml(v.voucher_no)}</title>
                        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap" rel="stylesheet">
                        <style>
                            body { font-family: 'Sarabun', sans-serif; padding: 30px; color: #333; line-height: 1.5; font-size: 14px; }
                            .doc-container { max-width: 800px; margin: 0 auto; border: 1px solid #ccc; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
                            .header-table td { vertical-align: top; }
                            .logo-img { height: 60px; max-width: 180px; object-fit: contain; }
                            .doc-title { text-align: right; }
                            .doc-title h2 { margin: 0; color: #dc2626; font-size: 24px; font-weight: 700; }
                            .doc-title div { margin-top: 5px; font-family: monospace; font-size: 13px; color: #555; }
                            .metadata-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
                            .metadata-table td { padding: 10px 15px; border-bottom: 1px solid #e2e8f0; }
                            .metadata-table td:last-child { border-bottom: none; }
                            .ledger-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
                            .ledger-table th { background-color: #f1f5f9; color: #334155; font-weight: 600; text-align: left; padding: 12px 10px; border: 1px solid #cbd5e1; }
                            .ledger-table td { padding: 12px 10px; border: 1px solid #cbd5e1; vertical-align: top; }
                            .total-row td { background-color: #f8fafc; font-weight: bold; border-top: 2px solid #94a3b8; border-bottom: 3px double #334155 !important; }
                            .amount-text-box { background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 15px; font-weight: 600; margin-bottom: 30px; text-align: center; }
                            .signature-section { width: 100%; border-collapse: collapse; margin-top: 40px; page-break-inside: avoid; }
                            .signature-box { border: 1px solid #cbd5e1; width: 25%; text-align: center; padding: 20px 10px; border-radius: 6px; }
                            .sig-line { width: 85%; border-bottom: 1px solid #333; margin: 35px auto 8px auto; height: 1px; }
                            .sig-label { font-size: 11px; color: #64748b; font-weight: bold; }
                        </style>
                    </head>
                    <body>
                        <div class="doc-container">
                            <table class="header-table">
                                <tr>
                                    <td>
                                        <img src="/logo_silminmobile.png" class="logo-img" onerror="this.src='/logo.png'">
                                        <div style="font-size: 11px; color: #64748b; margin-top: 5px; font-weight: 600;">SilminMobile ERP System</div>
                                    </td>
                                    <td class="doc-title">
                                        <h2>ใบสำคัญจ่าย (Payment Voucher)</h2>
                                        <div>เลขที่เอกสาร (Voucher No.): <strong>${escapeHtml(v.voucher_no) || '-'}</strong></div>
                                    </td>
                                </tr>
                            </table>

                            <table class="metadata-table">
                                <tr>
                                    <td style="width: 50%;"><strong>วันที่จ่ายเงิน (Payment Date):</strong> ${new Date(v.payment_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                                    <td><strong>สาขาที่บันทึก (Branch):</strong> ${escapeHtml(v.branch_id?.name) || 'สำนักงานใหญ่'}</td>
                                </tr>
                                <tr>
                                    <td><strong>จ่ายให้แก่ (Payee):</strong> ${escapeHtml(v.payee_name) || '-'}</td>
                                    <td><strong>ผู้ทำรายการ (Prepared By):</strong> ${escapeHtml(v.created_by?.name) || '-'}</td>
                                </tr>
                                <tr>
                                    <td colspan="2"><strong>คำอธิบาย/หมายเหตุ (Remark):</strong> ${escapeHtml(v.remark) || '-'}</td>
                                </tr>
                            </table>

                            <table class="ledger-table">
                                <thead>
                                    <tr>
                                        <th style="width: 15%;">รหัสบัญชี</th>
                                        <th style="width: 45%;">ชื่อบัญชี / รายการแจกแจง</th>
                                        <th style="width: 20%; text-align: right;">เดบิต (Dr. Baht)</th>
                                        <th style="width: 20%; text-align: right;">เครดิต (Cr. Baht)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <!-- Debit -->
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace;">${escapeHtml(v.debit_account_id?.account_code)}</td>
                                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: 600;">${escapeHtml(v.debit_account_id?.account_name)}</td>
                                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${debitAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-family: monospace;">-</td>
                                    </tr>
                                    <!-- VAT Row -->
                                    ${vatRowHtml}
                                    <!-- Credit -->
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace;">${escapeHtml(v.credit_account_id?.account_code)}</td>
                                        <td style="padding: 10px; border: 1px solid #ddd; text-indent: 15px; color: #555;">${escapeHtml(v.credit_account_id?.account_name)}</td>
                                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-family: monospace;">-</td>
                                        <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${creditAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr class="total-row">
                                        <td colspan="2" style="text-align: right; padding: 10px;">ยอดรวมทั้งสิ้น (Total)</td>
                                        <td style="padding: 10px; text-align: right; font-family: monospace;">${creditAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                        <td style="padding: 10px; text-align: right; font-family: monospace;">${creditAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            <div class="amount-text-box">
                                จำนวนเงินตัวอักษร: ( ${thaiWords} )
                            </div>

                            <table class="signature-section">
                                <tr>
                                    <td class="signature-box" style="border-right: none;">
                                        <div class="sig-line"></div>
                                        <div style="font-weight: 600;">${escapeHtml(v.created_by?.name) || '................................'}</div>
                                        <div class="sig-label" style="margin-top: 4px;">ผู้จัดทำ (Prepared By)</div>
                                    </td>
                                    <td class="signature-box" style="border-right: none;">
                                        <div class="sig-line"></div>
                                        <div style="font-weight: 600;">................................</div>
                                        <div class="sig-label" style="margin-top: 4px;">ผู้ตรวจสอบ (Checked By)</div>
                                    </td>
                                    <td class="signature-box" style="border-right: none;">
                                        <div class="sig-line"></div>
                                        <div style="font-weight: 600;">................................</div>
                                        <div class="sig-label" style="margin-top: 4px;">ผู้อนุมัติจ่าย (Approved By)</div>
                                    </td>
                                    <td class="signature-box">
                                        <div class="sig-line"></div>
                                        <div style="font-weight: 600;">................................</div>
                                        <div class="sig-label" style="margin-top: 4px;">ผู้รับเงิน (Receiver Signature)</div>
                                    </td>
                                </tr>
                            </table>

                            ${proofImageHtml}
                        </div>
                        <script>
                            window.onload = () => {
                                setTimeout(() => window.print(), 300);
                            };
                        </script>
                    </body>
                    </html>
                `;
                printWindow.document.write(html);
                printWindow.document.close();
            } else {
                showToast(data.message || 'ไม่สามารถพิมพ์ใบสำคัญจ่ายได้', 'error');
            }
        } catch (error) {
            console.error('Error printDisbursementVoucher:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'error');
        }
    }

    // Expose COA Settings & Disbursement Voucher functions to the window object for inline HTML event handlers
    window.openAddAccountModal = openAddAccountModal;
    window.closeAddAccountModal = closeAddAccountModal;
    window.saveAccountChart = saveAccountChart;
    window.editAccountChart = editAccountChart;
    window.deleteAccountChart = deleteAccountChart;
    window.onAccountCategoryChange = onAccountCategoryChange;
    window.switchCOATab = switchCOATab;
    window.filterCOATable = filterCOATable;
    window.openAddGroupModal = openAddGroupModal;
    window.closeAddGroupModal = closeAddGroupModal;
    window.saveAccountGroup = saveAccountGroup;
    window.onGroupCategoryChange = onGroupCategoryChange;
    window.addPnLLine = addPnLLine;
    window.savePnLConfig = savePnLConfig;
    window.removePnLLine = removePnLLine;
    window.calcDVVat = calcDVVat;
    window.submitDisbursement = submitDisbursement;
    window.loadDisbursements = loadDisbursements;
    window.printDisbursementVoucher = printDisbursementVoucher;
    window.initAccountingSettings = initAccountingSettings;
    window.initDisbursement = initDisbursement;

})();
