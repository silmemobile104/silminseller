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

    // สลับ list-wrap/cards ให้ตรงมุมมองที่จำไว้ - ต้องเรียกตอนวาดโครงร่างด้วย ไม่ใช่แค่ตอน render ข้อมูลจริง
    // ไม่งั้นถ้าจำโหมดการ์ดไว้ โครงร่างจะไปวาดใน wrap ที่ยังซ่อนอยู่ (ผู้ใช้เห็นพื้นที่ว่างจนกว่า fetch จะเสร็จ)
    function syncViewWrapVisibility(prefix, mode) {
        const listWrap = document.getElementById(`${prefix}-view-list-wrap`);
        const cardsWrap = document.getElementById(`${prefix}-view-cards`);
        if (listWrap) listWrap.classList.toggle('hidden', mode !== 'list');
        if (cardsWrap) cardsWrap.classList.toggle('hidden', mode !== 'card');
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
    // มุมมองตาราง/การ์ดของตาราง "ผังบัญชีทั้งหมด" — จำค่าไว้ข้ามการเข้าหน้า (เหมือนหน้า #deposits)
    let coaViewMode = localStorage.getItem('coa_view_mode') === 'card' ? 'card' : 'list';

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

    // ---------- ตารางผังบัญชี (DESIGN.md ข้อ 11.5 - 11.7) ----------
    const COA_COLS = 7, GRP_COLS = 4, PNL_COLS = 6;

    const coaStateRow = (cols, msg, cls = 'text-ink/50 italic') =>
        `<tr><td colspan="${cols}" class="px-6 py-8 text-center ${cls}">${escapeHtml(msg)}</td></tr>`;

    const coaStateCard = (msg, cls = 'text-ink/50 italic') =>
        `<div class="col-span-full py-12 text-center ${cls}">${escapeHtml(msg)}</div>`;

    const coaSkeleton = (tbodyId, cols, rows = 4) => {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        const bar = '<div class="h-3.5 w-full rounded-full bg-skeleton animate-pulse"></div>';
        tbody.innerHTML = Array.from({ length: rows }).map(() =>
            `<tr>${Array.from({ length: cols }).map(() =>
                `<td class="px-6 py-4">${bar}</td>`).join('')}</tr>`).join('');
    };

    // โครงร่างการ์ดผังบัญชี — สัดส่วนบล็อกเดินตามโครงจริงของ coaCardMarkup ด้านล่าง
    const coaCardSkeleton = (count = 4) => {
        const cardsWrap = document.getElementById('coa-view-cards');
        if (!cardsWrap) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        cardsWrap.innerHTML = Array.from({ length: count }).map(() => `
            <div class="elev-card bg-surface-tile-3 rounded-md p-3.5">
                <div class="flex items-start justify-between gap-2">${bar('w-20')}${bar('w-16')}</div>
                ${bar('w-32 mt-2.5')}
                <div class="flex items-center gap-2 mt-3.5 pt-3 border-t border-hairline">${bar('w-16 h-6')}${bar('w-16 h-6')}</div>
                <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                    ${bar('w-12')}
                    <div class="flex items-center gap-1.5">
                        <div class="w-8 h-8 rounded-lg bg-skeleton animate-pulse"></div>
                        <div class="w-8 h-8 rounded-lg bg-skeleton animate-pulse"></div>
                    </div>
                </div>
            </div>`).join('');
    };

    const coaSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // ป้ายเทาสำหรับหมวดหมู่/กลุ่ม (ข้อ 11.6 — ป้ายหมวดหมู่)
    const coaChipLabel = (text) =>
        `<span class="px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-chip/60 text-ink">${escapeHtml(text)}</span>`;

    async function initAccountingSettings() {
        syncViewWrapVisibility('coa', coaViewMode);
        if (coaViewMode === 'card') coaCardSkeleton(); else coaSkeleton('coa-table-body', COA_COLS);
        coaSkeleton('coa-groups-table-body', GRP_COLS);
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

                populateCategorySelect(document.getElementById('coa-filter-category'), 'ทุกหมวดหมู่');

                coaSetText('badge-coa-accounts', _coaCache.accounts.length);
                coaSetText('badge-coa-groups', _coaCache.groups.length);

                renderCOATable(_coaCache.accounts);
                renderCOAGroupsTable(_coaCache.groups);
                renderAcctTree();
            } else {
                document.getElementById('coa-table-body').innerHTML =
                    coaStateRow(COA_COLS, data.message || 'โหลดข้อมูลผังบัญชีไม่สำเร็จ', 'text-red-400');
                document.getElementById('coa-groups-table-body').innerHTML =
                    coaStateRow(GRP_COLS, data.message || 'โหลดข้อมูลกลุ่มบัญชีไม่สำเร็จ', 'text-red-400');
                showToast(data.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลผังบัญชี', 'error');
            }
        } catch (error) {
            console.error('Error loadCOAData:', error);
            const t1 = document.getElementById('coa-table-body');
            const t2 = document.getElementById('coa-groups-table-body');
            if (t1) t1.innerHTML = coaStateRow(COA_COLS, 'เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'text-red-400');
            if (t2) t2.innerHTML = coaStateRow(GRP_COLS, 'เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'text-red-400');
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'error');
        }
    }

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    function renderCOAChips() {
        const box = document.getElementById('coa-active-filters');
        if (!box) return;
        box.innerHTML = '';

        const searchEl = document.getElementById('coa-search');
        const catEl = document.getElementById('coa-filter-category');
        const chips = [];
        if (searchEl && searchEl.value.trim()) chips.push({ key: 'search', label: `ค้นหา: ${searchEl.value.trim()}` });
        if (catEl && catEl.value) {
            const opt = catEl.options[catEl.selectedIndex];
            chips.push({ key: 'category', label: `หมวดหมู่: ${opt ? opt.textContent : catEl.value}` });
        }

        const clearOne = (key) => {
            const el = document.getElementById(key === 'search' ? 'coa-search' : 'coa-filter-category');
            if (el) el.value = '';
            filterCOATable();
        };

        chips.forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40' +
                'text-ink text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
            chip.innerHTML = `<span>${escapeHtml(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.setAttribute('aria-label', `ลบตัวกรอง ${c.label}`);
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return;
                clearOne(c.key);
            });
            box.appendChild(chip);
        });

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น
        if (chips.length > 1) {
            const clearAll = document.createElement('button');
            clearAll.type = 'button';
            clearAll.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 ' +
                'rounded-full text-xs font-medium ring-1 ring-red-500/30 transition-colors cursor-pointer';
            clearAll.textContent = 'ล้างทั้งหมด';
            clearAll.addEventListener('click', () => {
                ['coa-search', 'coa-filter-category'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                filterCOATable();
            });
            box.appendChild(clearAll);
        }
    }

    // ข้อมูลที่คำนวณร่วมกันระหว่างแถวตารางกับการ์ด — แยกออกมาครั้งเดียวเพื่อไม่ให้สองมุมมองเพี้ยนจากกัน
    const coaBuildRowData = (acc) => {
        const cat = _coaCache.categories.find(c => c._id === idOf(acc.category_id)) || {};
        const grp = _coaCache.groups.find(g => g._id === idOf(acc.group_id)) || {};

        // บัญชีของระบบแก้/ลบไม่ได้ จึงไม่เรนเดอร์ปุ่มตั้งแต่แรก (ข้อ 11.12 ข้อ 11)
        const actions = acc.is_system
            ? '<span class="text-ink/50">-</span>'
            : `<button type="button" class="btn-coa-edit text-ink hover:text-amber-400 transition-colors p-2 cursor-pointer"
                    data-id="${escapeHtml(acc._id)}" title="แก้ไขบัญชี"
                    aria-label="แก้ไขบัญชี ${escapeHtml(acc.account_code)}">
                    <i class="fa-solid fa-pen-to-square"></i>
               </button>
               <button type="button" class="btn-coa-delete text-ink hover:text-red-400 transition-colors p-2 cursor-pointer"
                    data-id="${escapeHtml(acc._id)}" data-code="${escapeHtml(acc.account_code)}"
                    data-name="${escapeHtml(acc.account_name)}" title="ลบบัญชี"
                    aria-label="ลบบัญชี ${escapeHtml(acc.account_code)}">
                    <i class="fa-solid fa-trash"></i>
               </button>`;

        const typeBadge = acc.is_system
            ? '<span class="px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-chip/60 text-ink">ระบบ</span>'
            : '<span class="px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-state-ok-tint/[0.12] text-state-ok">กำหนดเอง</span>';

        return { cat, grp, actions, typeBadge };
    };

    const coaRowMarkup = (acc) => {
        const d = coaBuildRowData(acc);
        return `
        <tr class="hover:bg-divider transition-colors">
            <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${escapeHtml(acc.account_code)}</span></td>
            <td class="px-6 py-4 text-ink">${escapeHtml(acc.account_name)}</td>
            <td class="px-6 py-4">${d.cat.category_name ? coaChipLabel(d.cat.category_name) : '<span class="text-ink/50">-</span>'}</td>
            <td class="px-6 py-4">${d.grp.group_name ? coaChipLabel(d.grp.group_name) : '<span class="text-ink/50">-</span>'}</td>
            <td class="px-6 py-4 text-center text-ink font-medium">${acc.level || '-'}</td>
            <td class="px-6 py-4">${d.typeBadge}</td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-1">${d.actions}</div>
            </td>
        </tr>`;
    };

    // การ์ด — โครง: หัว (รหัสบัญชี / ประเภท) · ชื่อบัญชี · หมวดหมู่+กลุ่ม · footer (ระดับ + ปุ่มจัดการ)
    const coaCardMarkup = (acc) => {
        const d = coaBuildRowData(acc);
        return `
        <div class="elev-card bg-surface-tile-3 rounded-md p-3.5">
            <div class="flex items-start justify-between gap-2">
                <span class="font-mono font-semibold text-accent-ink truncate">${escapeHtml(acc.account_code)}</span>
                <div class="shrink-0">${d.typeBadge}</div>
            </div>
            <p class="text-ink font-medium mt-2.5 truncate">${escapeHtml(acc.account_name)}</p>

            <div class="flex flex-wrap items-center gap-2 mt-3.5 pt-3 border-t border-hairline">
                ${d.cat.category_name ? coaChipLabel(d.cat.category_name) : '<span class="text-ink/50 text-xs">ไม่มีหมวดหมู่</span>'}
                ${d.grp.group_name ? coaChipLabel(d.grp.group_name) : ''}
            </div>

            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                <span class="text-xs text-ink/70">ระดับ ${acc.level || '-'}</span>
                <div class="flex items-center gap-1">${d.actions}</div>
            </div>
        </div>`;
    };

    const coaBindRowHandlers = (container) => {
        container.querySelectorAll('.btn-coa-edit').forEach(b =>
            b.addEventListener('click', () => editAccountChart(b.dataset.id)));
        container.querySelectorAll('.btn-coa-delete').forEach(b =>
            b.addEventListener('click', () => deleteAccountChart(b.dataset.id, b.dataset.code, b.dataset.name)));
    };

    function renderCOATable(accountsToRender) {
        const tbody = document.getElementById('coa-table-body');
        if (!tbody) return;

        const listWrap = document.getElementById('coa-view-list-wrap');
        const cardsWrap = document.getElementById('coa-view-cards');
        if (listWrap) listWrap.classList.toggle('hidden', coaViewMode !== 'list');
        if (cardsWrap) cardsWrap.classList.toggle('hidden', coaViewMode !== 'card');

        renderCOAChips();
        const rows = accountsToRender || [];
        const total = (_coaCache.accounts || []).length;
        coaSetText('coa-result-count', total ? `แสดง ${rows.length} จาก ${total} รายการ` : '');

        if (!rows.length) {
            const emptyMsg = total ? 'ไม่พบบัญชีที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อมูลผังบัญชี';
            tbody.innerHTML = coaStateRow(COA_COLS, emptyMsg);
            if (cardsWrap) cardsWrap.innerHTML = coaStateCard(emptyMsg);
            return;
        }

        if (coaViewMode === 'card') {
            cardsWrap.innerHTML = rows.map(coaCardMarkup).join('');
            coaBindRowHandlers(cardsWrap);
        } else {
            tbody.innerHTML = rows.map(coaRowMarkup).join('');
            coaBindRowHandlers(tbody);
        }
    }

    function filterCOATable() {
        const searchTxt = (document.getElementById('coa-search')?.value || '').toLowerCase();
        const catId = document.getElementById('coa-filter-category')?.value || '';

        const filtered = _coaCache.accounts.filter(acc => {
            const matchSearch = (acc.account_code || '').toLowerCase().includes(searchTxt) ||
                (acc.account_name || '').toLowerCase().includes(searchTxt);
            const matchCat = catId ? idOf(acc.category_id) === catId : true;
            return matchSearch && matchCat;
        });

        renderCOATable(filtered);
    }

    function renderCOAGroupsTable(groups) {
        const tbody = document.getElementById('coa-groups-table-body');
        if (!tbody) return;

        const rows = groups || [];
        coaSetText('coa-groups-count', rows.length ? `ทั้งหมด ${rows.length} กลุ่ม` : '');

        if (!rows.length) {
            tbody.innerHTML = coaStateRow(GRP_COLS, 'ยังไม่มีกลุ่มบัญชี');
            return;
        }

        tbody.innerHTML = rows.map(grp => {
            const cat = _coaCache.categories.find(c => c._id === idOf(grp.category_id)) || {};
            const accCount = _coaCache.accounts.filter(a => idOf(a.group_id) === grp._id).length;
            return `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${escapeHtml(grp.group_code)}</span></td>
                <td class="px-6 py-4 text-ink">${escapeHtml(grp.group_name)}</td>
                <td class="px-6 py-4">${cat.category_name ? coaChipLabel(cat.category_name) : '<span class="text-ink/50">-</span>'}</td>
                <td class="px-6 py-4 text-center text-ink font-medium">${accCount}
                    <span class="text-xs text-ink font-normal">บัญชี</span></td>
            </tr>`;
        }).join('');
    }

    // ---------- แท็บ ----------
    const COA_TAB_BASE = 'elev-chip tab-toggle-btn px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer';
    const COA_TAB_ON = 'bg-primary text-on-primary ring-1 ring-accent-ink apple-active-accent';
    const COA_TAB_OFF = 'elev-field bg-field text-body-muted hover:ring-1 hover:ring-accent-ink hover:text-ink';
    const COA_BADGE_ON = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-hairline/20';
    const COA_BADGE_OFF = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-chip/60 text-ink';

    function switchCOATab(tabName) {
        ['accounts', 'groups', 'pnl'].forEach(t => {
            const btn = document.getElementById(`coa-tab-${t}`);
            const content = document.getElementById(`coa-content-${t}`);
            const badge = document.getElementById(`badge-coa-${t}`);
            const on = t === tabName;
            if (btn) {
                btn.className = `${COA_TAB_BASE} ${on ? COA_TAB_ON : COA_TAB_OFF}`;
                btn.setAttribute('aria-pressed', String(on));
            }
            if (badge) badge.className = on ? COA_BADGE_ON : COA_BADGE_OFF;
            if (content) content.classList.toggle('hidden', !on);
        });

        if (tabName === 'pnl') {
            coaSkeleton('pnl-config-table-body', PNL_COLS, 3);
            loadPnLConfig();
        }
    }

    // สลับมุมมอง List/Card ของตาราง "ผังบัญชีทั้งหมด" — ผูกที่ top-level ได้ (ไฟล์นี้เป็น js/page-*.js
    // โหลดหลัง loadPageView แทรก HTML ของ accounting-settings.html เข้า DOM แล้วเสมอ)
    const coaViewListBtn = document.getElementById('coa-view-list');
    const coaViewCardBtn = document.getElementById('coa-view-card');
    if (coaViewListBtn && coaViewCardBtn) {
        const syncCoaViewButtons = (mode) => window.syncViewToggleButtons(coaViewListBtn, coaViewCardBtn, mode);
        const applyCoaViewMode = (mode) => {
            coaViewMode = mode;
            localStorage.setItem('coa_view_mode', mode);
            syncCoaViewButtons(mode);
            filterCOATable();
        };
        coaViewListBtn.addEventListener('click', () => applyCoaViewMode('list'));
        coaViewCardBtn.addEventListener('click', () => applyCoaViewMode('card'));
        syncCoaViewButtons(coaViewMode);
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

    async function deleteAccountChart(id, code, name) {
        // การลบย้อนไม่ได้ ต้องผ่าน showConfirm() ของระบบ (ข้อ 11.12 ข้อ 11)
        const label = code || name
            ? `<strong class="font-mono text-accent-ink">${escapeHtml(code || '')}</strong> ${escapeHtml(name || '')}`
            : 'บัญชีนี้';
        showConfirm('ลบรหัสบัญชี', `ต้องการลบ ${label} ออกจากผังบัญชีหรือไม่<br><span class="text-xs text-ink/70">การลบนี้ย้อนกลับไม่ได้</span>`,
            () => doDeleteAccountChart(id), 'ลบบัญชี', 'danger');
    }

    async function doDeleteAccountChart(id) {
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

    // ---------- หน้า "ตั้งค่างบกำไรขาดทุน" (#pnl-config) ----------
    // ข้อมูลชุดเดียวกับ PnLConfig (collection pnlconfig ที่รายงาน P&L ใช้) — 1 แถว = 1 บรรทัดของงบ
    // หมวด/section ไม่กรอกเอง เซิร์ฟเวอร์ดูจากกลุ่มบัญชี; กลุ่มที่เลือกได้เฉพาะหมวดรายได้/ค่าใช้จ่าย
    const PL_COLS = 7;
    const PL_CATEGORIES = ['รายได้', 'ค่าใช้จ่าย'];
    let _plItems = [];

    async function initPnlConfigPage() {
        const search = document.getElementById('pl-item-search');
        if (search) search.value = '';
        coaSkeleton('pl-item-table-body', PL_COLS);
        await Promise.all([loadCOAData(), loadPlItems()]);
    }

    async function loadPlItems() {
        const tbody = document.getElementById('pl-item-table-body');
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/pnl-config`);
            const data = await res.json();
            if (!data.success) {
                if (tbody) tbody.innerHTML = coaStateRow(PL_COLS, data.message || 'ดึงข้อมูลงบกำไรขาดทุนไม่สำเร็จ', 'text-red-400');
                return;
            }
            _plItems = data.configs || [];
            renderPlPage();
        } catch (error) {
            console.error('Error loadPlItems:', error);
            if (tbody) tbody.innerHTML = coaStateRow(PL_COLS, 'เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'text-red-400');
        }
    }

    function renderPlPage() {
        const tbody = document.getElementById('pl-item-table-body');
        if (!tbody) return;

        const searchTxt = (document.getElementById('pl-item-search')?.value || '').trim().toLowerCase();
        const rows = _plItems.filter(it => !searchTxt ||
            (it.display_name || '').toLowerCase().includes(searchTxt) ||
            (it.group_id?.group_name || '').toLowerCase().includes(searchTxt) ||
            (it.account_ids || []).some(a =>
                (a.account_code || '').toLowerCase().includes(searchTxt) ||
                (a.account_name || '').toLowerCase().includes(searchTxt)));
        coaSetText('pl-item-result-count', _plItems.length ? `แสดง ${rows.length} จาก ${_plItems.length} รายการ` : '');

        if (!rows.length) {
            tbody.innerHTML = coaStateRow(PL_COLS, _plItems.length ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'ยังไม่มีรายการงบกำไรขาดทุน');
            return;
        }
        const dash = '<span class="text-ink/50">-</span>';
        tbody.innerHTML = rows.map(it => {
            const catName = it.category_id?.category_name;
            const grpName = it.group_id?.group_name;
            const accs = it.account_ids || [];
            const codeLines = accs.length
                ? accs.map(a => `<div class="font-mono font-semibold text-accent-ink">${escapeHtml(a.account_code)}</div>`).join('')
                : dash;
            const nameLines = accs.length
                ? accs.map(a => `<div class="text-ink">${escapeHtml(a.account_name)}</div>`).join('')
                : dash;
            return `
            <tr class="hover:bg-divider transition-colors align-top">
                <td class="px-6 py-4">${catName ? coaChipLabel(catName) : dash}</td>
                <td class="px-6 py-4">${grpName ? coaChipLabel(grpName) : dash}</td>
                <td class="px-6 py-4 font-mono text-ink">${escapeHtml(it.sort_order)}</td>
                <td class="px-6 py-4 text-ink">${escapeHtml(it.display_name)}</td>
                <td class="px-6 py-4 space-y-1">${codeLines}</td>
                <td class="px-6 py-4 space-y-1">${nameLines}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button type="button" class="btn-pl-edit text-ink hover:text-amber-400 transition-colors p-2 cursor-pointer"
                            data-id="${escapeHtml(it._id)}" title="แก้ไขรายการ"
                            aria-label="แก้ไขรายการ ${escapeHtml(it.display_name)}">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="btn-pl-delete text-ink hover:text-red-400 transition-colors p-2 cursor-pointer"
                            data-id="${escapeHtml(it._id)}" title="ลบรายการ"
                            aria-label="ลบรายการ ${escapeHtml(it.display_name)}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('.btn-pl-edit').forEach(b =>
            b.addEventListener('click', () => openPlItemModal(_plItems.find(x => x._id === b.dataset.id))));
        tbody.querySelectorAll('.btn-pl-delete').forEach(b =>
            b.addEventListener('click', () => deletePlItem(_plItems.find(x => x._id === b.dataset.id))));
    }

    function openPlItemModal(editData = null) {
        const modal = document.getElementById('modal-pl-item');
        if (!modal) return;
        const catIds = new Set(_coaCache.categories.filter(c => PL_CATEGORIES.includes(c.category_name)).map(c => c._id));
        const grpSelect = document.getElementById('pl-item-group');
        grpSelect.innerHTML = '<option value="">-- เลือกกลุ่มบัญชี --</option>' + _coaCache.groups
            .filter(g => catIds.has(idOf(g.category_id)))
            .map(g => {
                const cat = _coaCache.categories.find(c => c._id === idOf(g.category_id));
                return `<option value="${escapeHtml(g._id)}">${escapeHtml(cat.category_name)} · ${escapeHtml(g.group_name)}</option>`;
            }).join('');

        document.getElementById('modal-pl-item-title').textContent = editData ? 'แก้ไขรายการงบกำไรขาดทุน' : 'เพิ่มรายการงบกำไรขาดทุน';
        document.getElementById('pl-item-id').value = editData?._id || '';
        grpSelect.value = editData ? (idOf(editData.group_id) || '') : '';
        document.getElementById('pl-item-order').value = editData
            ? editData.sort_order
            : (_plItems.reduce((m, x) => Math.max(m, x.sort_order || 0), 0) + 1);
        document.getElementById('pl-item-name').value = editData?.display_name || '';

        // บัญชีที่เลือกได้ = ทุกบัญชีในหมวดรายได้/ค่าใช้จ่าย (ไม่ผูกกับหมวดของกลุ่ม — ดูเหตุผลที่ POST /pnl-items)
        const picked = new Set((editData?.account_ids || []).map(idOf));
        const accs = _coaCache.accounts.filter(a => catIds.has(idOf(a.category_id)));
        document.getElementById('pl-item-accounts').innerHTML = accs.length ? accs.map(a => `
            <label class="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-divider cursor-pointer">
                <input type="checkbox" class="pl-account-check" value="${escapeHtml(a._id)}" ${picked.has(a._id) ? 'checked' : ''}>
                <span class="font-mono text-accent-ink">${escapeHtml(a.account_code)}</span>
                <span class="text-ink">${escapeHtml(a.account_name)}</span>
            </label>`).join('')
            : '<p class="px-2 py-1 text-body-muted text-xs">ยังไม่มีรหัสบัญชีหมวดรายได้/ค่าใช้จ่าย</p>';

        modal.classList.remove('hidden');
        grpSelect.focus();
    }

    function closePlItemModal() {
        const modal = document.getElementById('modal-pl-item');
        if (modal) modal.classList.add('hidden');
    }

    async function savePlItem() {
        const _id = document.getElementById('pl-item-id')?.value;
        const payload = {
            group_id: document.getElementById('pl-item-group')?.value,
            sort_order: Number(document.getElementById('pl-item-order')?.value),
            display_name: (document.getElementById('pl-item-name')?.value || '').trim(),
            account_ids: Array.from(document.querySelectorAll('#pl-item-accounts .pl-account-check:checked')).map(c => c.value)
        };
        if (_id) payload._id = _id;

        if (!payload.group_id || !payload.display_name || !Number.isInteger(payload.sort_order) || payload.sort_order < 1) {
            showToast('กรุณาเลือกกลุ่มบัญชี กรอกลำดับ (จำนวนเต็มตั้งแต่ 1) และชื่อรายการให้ครบ', 'warning');
            return;
        }

        const btn = document.getElementById('pl-item-save');
        if (btn) btn.disabled = true; // กันกดซ้ำ — POST ไม่ retry และไม่ควรยิงซ้ำ
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/pnl-items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast(_id ? 'แก้ไขรายการเรียบร้อย' : 'เพิ่มรายการเรียบร้อย', 'success');
                closePlItemModal();
                loadPlItems();
            } else {
                showToast('บันทึกรายการไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error savePlItem:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function deletePlItem(item) {
        if (!item) return;
        const label = `<strong class="font-mono text-accent-ink">${escapeHtml(item.sort_order)}</strong> ${escapeHtml(item.display_name)}`;
        showConfirm('ลบรายการงบกำไรขาดทุน', `ต้องการลบ ${label} หรือไม่<br><span class="text-xs text-ink/70">การลบนี้ย้อนกลับไม่ได้</span>`,
            () => doDeletePlItem(item._id), 'ลบรายการ', 'danger');
    }

    async function doDeletePlItem(id) {
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/pnl-items/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('ลบรายการเรียบร้อย', 'success');
                loadPlItems();
            } else {
                showToast('ลบรายการไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error doDeletePlItem:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
    }

    // ---------- หน้า "ตั้งค่างบดุล" (#balance-sheet-config) ----------
    // 1 แถว = 1 บรรทัดของงบดุล (collection balancesheetitem): กลุ่มบัญชี + ลำดับ + ชื่อรายการ + รหัสบัญชีที่ประกอบ
    // หมวดไม่เก็บซ้ำ — ดูจากกลุ่มบัญชี; บัญชีที่เลือกได้ต้องอยู่หมวดเดียวกับกลุ่ม (เซิร์ฟเวอร์ตรวจอีกชั้น)
    const BS_COLS = 7;
    let _bsItems = [];

    async function initBalanceSheetConfig() {
        const search = document.getElementById('bs-item-search');
        if (search) search.value = '';
        coaSkeleton('bs-item-table-body', BS_COLS);
        // loadCOAData เติม _coaCache (กลุ่ม/บัญชี สำหรับฟอร์ม) — โหลดคู่กับรายการงบดุล
        await Promise.all([loadCOAData(), loadBsItems()]);
    }

    async function loadBsItems() {
        const tbody = document.getElementById('bs-item-table-body');
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/balance-sheet-items`);
            const data = await res.json();
            if (!data.success) {
                if (tbody) tbody.innerHTML = coaStateRow(BS_COLS, data.message || 'ดึงข้อมูลงบดุลไม่สำเร็จ', 'text-red-400');
                return;
            }
            _bsItems = data.items || [];
            renderBsPage();
        } catch (error) {
            console.error('Error loadBsItems:', error);
            if (tbody) tbody.innerHTML = coaStateRow(BS_COLS, 'เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'text-red-400');
        }
    }

    function renderBsPage() {
        const tbody = document.getElementById('bs-item-table-body');
        if (!tbody) return;

        const searchTxt = (document.getElementById('bs-item-search')?.value || '').trim().toLowerCase();
        const rows = _bsItems.filter(it => !searchTxt ||
            (it.item_name || '').toLowerCase().includes(searchTxt) ||
            (it.group_id?.group_name || '').toLowerCase().includes(searchTxt) ||
            (it.account_ids || []).some(a =>
                (a.account_code || '').toLowerCase().includes(searchTxt) ||
                (a.account_name || '').toLowerCase().includes(searchTxt)));
        coaSetText('bs-item-result-count', _bsItems.length ? `แสดง ${rows.length} จาก ${_bsItems.length} รายการ` : '');

        if (!rows.length) {
            tbody.innerHTML = coaStateRow(BS_COLS, _bsItems.length ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'ยังไม่มีรายการงบดุล');
            return;
        }
        const dash = '<span class="text-ink/50">-</span>';
        tbody.innerHTML = rows.map(it => {
            const grp = it.group_id || {};
            const catName = grp.category_id?.category_name;
            const accs = it.account_ids || [];
            const codeLines = accs.length
                ? accs.map(a => `<div class="font-mono font-semibold text-accent-ink">${escapeHtml(a.account_code)}</div>`).join('')
                : dash;
            const nameLines = accs.length
                ? accs.map(a => `<div class="text-ink">${escapeHtml(a.account_name)}</div>`).join('')
                : dash;
            return `
            <tr class="hover:bg-divider transition-colors align-top">
                <td class="px-6 py-4">${catName ? coaChipLabel(catName) : dash}</td>
                <td class="px-6 py-4">${grp.group_name ? coaChipLabel(grp.group_name) : dash}</td>
                <td class="px-6 py-4 font-mono text-ink">${escapeHtml(it.sort_order)}</td>
                <td class="px-6 py-4 text-ink">${escapeHtml(it.item_name)}</td>
                <td class="px-6 py-4 space-y-1">${codeLines}</td>
                <td class="px-6 py-4 space-y-1">${nameLines}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button type="button" class="btn-bs-edit text-ink hover:text-amber-400 transition-colors p-2 cursor-pointer"
                            data-id="${escapeHtml(it._id)}" title="แก้ไขบัญชีงบดุล"
                            aria-label="แก้ไขบัญชีงบดุล ${escapeHtml(it.item_name)}">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="btn-bs-delete text-ink hover:text-red-400 transition-colors p-2 cursor-pointer"
                            data-id="${escapeHtml(it._id)}" title="ลบบัญชีงบดุล"
                            aria-label="ลบบัญชีงบดุล ${escapeHtml(it.item_name)}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('.btn-bs-edit').forEach(b =>
            b.addEventListener('click', () => openBsItemModal(_bsItems.find(x => x._id === b.dataset.id))));
        tbody.querySelectorAll('.btn-bs-delete').forEach(b =>
            b.addEventListener('click', () => deleteBsItem(_bsItems.find(x => x._id === b.dataset.id))));
    }

    // เติมรายการกลุ่มบัญชี (ขึ้นต้นด้วยชื่อหมวด) ลงใน select ของฟอร์ม
    function populateBsGroupSelect(selectEl) {
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">-- เลือกกลุ่มบัญชี --</option>' + _coaCache.groups.map(g => {
            const cat = _coaCache.categories.find(c => c._id === idOf(g.category_id));
            return `<option value="${escapeHtml(g._id)}">${escapeHtml(cat ? cat.category_name + ' · ' : '')}${escapeHtml(g.group_name)}</option>`;
        }).join('');
    }

    // เติมกล่องเลือกบัญชีตามหมวดของกลุ่มที่เลือก — selectedIds = บัญชีที่ติ๊กไว้แล้ว (ตอนแก้ไข)
    function onBsGroupChange(selectedIds = []) {
        const box = document.getElementById('bs-item-accounts');
        if (!box) return;
        const groupId = document.getElementById('bs-item-group')?.value;
        const grp = _coaCache.groups.find(g => g._id === groupId);
        if (!grp) {
            box.innerHTML = '<p class="px-2 py-1 text-body-muted text-xs">เลือกกลุ่มบัญชีก่อน</p>';
            return;
        }
        const catId = idOf(grp.category_id);
        const accs = _coaCache.accounts.filter(a => idOf(a.category_id) === catId);
        const picked = new Set(Array.isArray(selectedIds) ? selectedIds : []);
        if (!accs.length) {
            box.innerHTML = '<p class="px-2 py-1 text-body-muted text-xs">ยังไม่มีรหัสบัญชีในหมวดนี้</p>';
            return;
        }
        box.innerHTML = accs.map(a => `
            <label class="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-divider cursor-pointer">
                <input type="checkbox" class="bs-account-check" value="${escapeHtml(a._id)}" ${picked.has(a._id) ? 'checked' : ''}>
                <span class="font-mono text-accent-ink">${escapeHtml(a.account_code)}</span>
                <span class="text-ink">${escapeHtml(a.account_name)}</span>
            </label>`).join('');
    }

    function openBsItemModal(editData = null) {
        const modal = document.getElementById('modal-bs-item');
        if (!modal) return;
        populateBsGroupSelect(document.getElementById('bs-item-group'));
        document.getElementById('modal-bs-item-title').textContent = editData ? 'แก้ไขบัญชีงบดุล' : 'เพิ่มบัญชีงบดุล';
        document.getElementById('bs-item-id').value = editData?._id || '';
        document.getElementById('bs-item-group').value = editData ? (idOf(editData.group_id) || '') : '';
        // เพิ่มใหม่ — เสนอลำดับถัดจากลำดับสูงสุดที่มีอยู่
        document.getElementById('bs-item-order').value = editData
            ? editData.sort_order
            : (_bsItems.reduce((m, x) => Math.max(m, x.sort_order || 0), 0) + 1);
        document.getElementById('bs-item-name').value = editData?.item_name || '';
        onBsGroupChange((editData?.account_ids || []).map(idOf));
        modal.classList.remove('hidden');
        document.getElementById('bs-item-group')?.focus();
    }

    function closeBsItemModal() {
        const modal = document.getElementById('modal-bs-item');
        if (modal) modal.classList.add('hidden');
    }

    async function saveBsItem() {
        const _id = document.getElementById('bs-item-id')?.value;
        const payload = {
            group_id: document.getElementById('bs-item-group')?.value,
            sort_order: Number(document.getElementById('bs-item-order')?.value),
            item_name: (document.getElementById('bs-item-name')?.value || '').trim(),
            account_ids: Array.from(document.querySelectorAll('#bs-item-accounts .bs-account-check:checked')).map(c => c.value)
        };
        if (_id) payload._id = _id;

        if (!payload.group_id || !payload.item_name || !Number.isInteger(payload.sort_order) || payload.sort_order < 1) {
            showToast('กรุณาเลือกกลุ่มบัญชี กรอกลำดับ (จำนวนเต็มตั้งแต่ 1) และชื่อรายการให้ครบ', 'warning');
            return;
        }

        const btn = document.getElementById('bs-item-save');
        if (btn) btn.disabled = true; // กันกดซ้ำ — POST ไม่ retry และไม่ควรยิงซ้ำ
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/balance-sheet-items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast(_id ? 'แก้ไขบัญชีงบดุลเรียบร้อย' : 'เพิ่มบัญชีงบดุลเรียบร้อย', 'success');
                closeBsItemModal();
                loadBsItems();
            } else {
                showToast('บันทึกบัญชีงบดุลไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error saveBsItem:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function deleteBsItem(item) {
        if (!item) return;
        // การลบย้อนไม่ได้ ต้องผ่าน showConfirm() ของระบบ (ข้อ 11.12 ข้อ 11)
        const label = `<strong class="font-mono text-accent-ink">${escapeHtml(item.sort_order)}</strong> ${escapeHtml(item.item_name)}`;
        showConfirm('ลบบัญชีงบดุล', `ต้องการลบ ${label} หรือไม่<br><span class="text-xs text-ink/70">การลบนี้ย้อนกลับไม่ได้</span>`,
            () => doDeleteBsItem(item._id), 'ลบบัญชีงบดุล', 'danger');
    }

    async function doDeleteBsItem(id) {
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/balance-sheet-items/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('ลบบัญชีงบดุลเรียบร้อย', 'success');
                loadBsItems();
            } else {
                showToast('ลบบัญชีงบดุลไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error doDeleteBsItem:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
    }

    // ---------- หน้า "หมวดหมู่บัญชี" (#account-tree) ----------
    // โฟลเดอร์ 3 ชั้น: หมวด (5 หมวดคงที่ ไม่มีเพิ่ม/ลบ) > กลุ่มบัญชี > รหัสบัญชี
    // กลุ่มและรหัสบัญชี เพิ่ม/แก้ไข/ปิดใช้งาน/ลบ ได้ — ใช้ข้อมูลชุดเดียวกับ _coaCache (loadCOAData)
    // ลบไม่ได้ถ้ามีของที่อ้างถึงอยู่ (เซิร์ฟเวอร์ตรวจและบอกเหตุผล) จึงมีปิดใช้งานเป็นทางเลือก
    const TREE_OPEN_KEY = 'acct_tree_open';
    const TREE_BTN = 'p-2 transition-colors cursor-pointer text-ink';
    let _treeBound = false;
    let _treeOpen = new Set(); // 'cat:<id>' / 'grp:<id>' ที่กางอยู่
    try { _treeOpen = new Set(JSON.parse(localStorage.getItem(TREE_OPEN_KEY) || '[]')); } catch (e) { }

    const isOn = (x) => x.is_active !== false; // ข้อมูลเก่าไม่มีฟิลด์ is_active = เปิดอยู่

    function saveTreeOpen() {
        try { localStorage.setItem(TREE_OPEN_KEY, JSON.stringify([..._treeOpen])); } catch (e) { }
    }

    async function initAccountTree() {
        if (!_treeBound) {
            _treeBound = true; // ผูกครั้งเดียว — HTML ถูกแทรกครั้งเดียว แต่ init ถูกเรียกทุกครั้งที่เข้าหน้า
            document.getElementById('acct-tree-search')?.addEventListener('input', () => renderAcctTree());
            document.getElementById('acct-tree-status')?.addEventListener('change', () => renderAcctTree());
            document.getElementById('btn-acct-tree-toggle-all')?.addEventListener('click', () => {
                const allOpen = _coaCache.categories.every(c => _treeOpen.has('cat:' + c._id));
                _coaCache.categories.forEach(c => {
                    if (allOpen) _treeOpen.delete('cat:' + c._id); else _treeOpen.add('cat:' + c._id);
                });
                if (allOpen) _coaCache.groups.forEach(g => _treeOpen.delete('grp:' + g._id));
                saveTreeOpen();
                renderAcctTree();
            });
        }
        const search = document.getElementById('acct-tree-search');
        if (search) search.value = '';
        const status = document.getElementById('acct-tree-status');
        if (status) status.value = '';
        const root = document.getElementById('acct-tree-root');
        if (root) root.innerHTML = `<div class="py-12 text-center text-ink/60 italic">กำลังโหลดข้อมูล...</div>`;
        await loadCOAData();
    }

    function treeBadge(on) {
        return on
            ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[0.375rem] bg-state-ok-tint/[0.12] text-state-ok text-xs font-medium"><span class="w-1.5 h-1.5 rounded-full bg-state-ok"></span>ใช้งาน</span>`
            : `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[0.375rem] bg-chip/60 text-ink text-xs font-medium"><span class="w-1.5 h-1.5 rounded-full bg-ink/40"></span>ปิดใช้งาน</span>`;
    }

    // ปุ่มแก้ไข / เปิด-ปิดใช้งาน / ลบ ของแถวกลุ่มหรือรหัสบัญชี — data-act บอกว่าทำอะไร data-kind บอกว่าเป็นกลุ่ม (grp) หรือบัญชี (acc)
    function treeActions(kind, item, label, canDelete) {
        const on = isOn(item);
        const id = escapeHtml(item._id);
        const lbl = escapeHtml(label);
        return `<div class="flex items-center justify-end gap-0.5 shrink-0">
            <button type="button" class="acct-tree-act ${TREE_BTN} hover:text-amber-400" data-act="edit" data-kind="${kind}" data-id="${id}" title="แก้ไข" aria-label="แก้ไข ${lbl}"><i class="fa-solid fa-pen-to-square"></i></button>
            <button type="button" class="acct-tree-act ${TREE_BTN} ${on ? 'hover:text-red-400' : 'hover:text-state-ok'}" data-act="toggle" data-kind="${kind}" data-id="${id}" title="${on ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}" aria-label="${on ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'} ${lbl}"><i class="fa-solid ${on ? 'fa-ban' : 'fa-circle-check'}"></i></button>
            ${canDelete ? `<button type="button" class="acct-tree-act ${TREE_BTN} hover:text-red-400" data-act="delete" data-kind="${kind}" data-id="${id}" title="ลบ" aria-label="ลบ ${lbl}"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>`;
    }

    function renderAcctTree() {
        const root = document.getElementById('acct-tree-root');
        if (!root) return;
        const q = (document.getElementById('acct-tree-search')?.value || '').trim().toLowerCase();
        const st = document.getElementById('acct-tree-status')?.value || '';
        const searching = !!(q || st);
        const th = (a, b) => String(a || '').localeCompare(String(b || ''), 'th', { numeric: true });
        const match = (...parts) => !q || parts.some(p => String(p || '').toLowerCase().includes(q));
        const stOk = (x) => !st || (st === 'active' ? isOn(x) : !isOn(x));

        const accsByGroup = new Map();
        _coaCache.accounts.forEach(a => {
            const gid = idOf(a.group_id);
            if (!gid) return;
            if (!accsByGroup.has(gid)) accsByGroup.set(gid, []);
            accsByGroup.get(gid).push(a);
        });

        const cats = [..._coaCache.categories].sort((a, b) => th(a.category_code, b.category_code));
        if (!cats.length) { root.innerHTML = `<div class="py-12 text-center text-ink/60 italic">ไม่พบหมวดบัญชี</div>`; return; }

        const html = cats.map(cat => {
            const groups = _coaCache.groups.filter(g => idOf(g.category_id) === cat._id).sort((a, b) => th(a.group_code, b.group_code));
            const groupHtml = groups.map(g => {
                const accs = (accsByGroup.get(g._id) || []).slice().sort((a, b) => th(a.account_code, b.account_code));
                // ค้นหา: กลุ่มที่รหัส/ชื่อตรง โชว์บัญชีทั้งหมดในกลุ่ม — ไม่งั้นโชว์เฉพาะบัญชีที่ตรง (กลุ่มที่ไม่มีอะไรตรงถูกซ่อน)
                const groupSelf = match(g.group_code, g.group_name) && stOk(g);
                const accList = accs.filter(a => stOk(a) && (groupSelf || match(a.account_code, a.account_name)));
                if (searching && !groupSelf && !accList.length) return '';
                const gKey = 'grp:' + g._id;
                const open = searching ? true : _treeOpen.has(gKey);
                const gOn = isOn(g);
                const accRows = accList.map(a => `
                    <div class="flex items-center gap-3 pl-14 pr-3 py-2 hover:bg-divider rounded-lg ${isOn(a) && gOn ? '' : 'opacity-60'}">
                        <i class="fa-solid fa-file-lines text-ink/50 w-4 text-center text-sm"></i>
                        <span class="font-mono font-semibold text-accent-ink w-24 shrink-0">${escapeHtml(a.account_code)}</span>
                        <span class="text-ink flex-1 min-w-0 truncate">${escapeHtml(a.account_name)}</span>
                        ${a.is_system ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-chip/60 text-ink shrink-0">ระบบ</span>' : ''}
                        <span class="shrink-0">${treeBadge(isOn(a))}</span>
                        ${treeActions('acc', a, a.account_code + ' ' + a.account_name, !a.is_system)}
                    </div>`).join('') || `<div class="pl-14 py-2 text-sm text-ink/60 italic">${accs.length ? 'ไม่มีรหัสบัญชีที่ตรงกับตัวกรอง' : 'ยังไม่มีรหัสบัญชีในกลุ่มนี้'}</div>`;
                return `
                <div class="rounded-xl">
                    <div class="flex items-center gap-3 pl-8 pr-3 py-2.5 hover:bg-divider rounded-lg ${gOn ? '' : 'opacity-60'}">
                        <button type="button" class="acct-tree-fold flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer" data-key="${gKey}" aria-expanded="${open}">
                            <i class="fa-solid ${open ? 'fa-chevron-down' : 'fa-chevron-right'} text-ink/60 w-4 text-center text-xs"></i>
                            <i class="fa-solid ${open ? 'fa-folder-open' : 'fa-folder'} text-accent-ink"></i>
                            <span class="font-mono font-semibold text-accent-ink shrink-0">${escapeHtml(g.group_code)}</span>
                            <span class="text-ink font-medium truncate">${escapeHtml(g.group_name)}</span>
                            <span class="text-xs text-ink/60 shrink-0">${accs.length} บัญชี</span>
                        </button>
                        ${g.is_system ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-chip/60 text-ink shrink-0">ระบบ</span>' : ''}
                        <span class="shrink-0">${treeBadge(gOn)}</span>
                        <button type="button" class="acct-tree-act ${TREE_BTN} hover:text-accent-ink" data-act="add" data-kind="acc" data-id="${escapeHtml(g._id)}" title="เพิ่มรหัสบัญชี" aria-label="เพิ่มรหัสบัญชีในกลุ่ม ${escapeHtml(g.group_name)}"><i class="fa-solid fa-plus"></i></button>
                        ${treeActions('grp', g, g.group_code + ' ' + g.group_name, !g.is_system)}
                    </div>
                    ${open ? `<div class="space-y-0.5">${accRows}</div>` : ''}
                </div>`;
            }).join('');

            if (searching && !groupHtml) return '';
            const cKey = 'cat:' + cat._id;
            const open = searching ? true : _treeOpen.has(cKey);
            return `
            <div class="elev-card bg-surface-tile-3 rounded-xl overflow-hidden">
                <div class="flex items-center gap-3 px-4 py-3">
                    <button type="button" class="acct-tree-fold flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer" data-key="${cKey}" aria-expanded="${open}">
                        <i class="fa-solid ${open ? 'fa-chevron-down' : 'fa-chevron-right'} text-ink/60 w-4 text-center text-xs"></i>
                        <i class="fa-solid ${open ? 'fa-folder-open' : 'fa-folder'} text-accent-ink text-lg"></i>
                        <span class="font-mono font-semibold text-accent-ink shrink-0">${escapeHtml(cat.category_code)}</span>
                        <span class="text-ink font-bold truncate">${escapeHtml(cat.category_name)}</span>
                        <span class="text-xs text-ink/60 shrink-0">${groups.length} กลุ่ม</span>
                    </button>
                    <button type="button" class="acct-tree-act elev-field px-3 py-1.5 bg-field text-ink hover:ring-1 hover:ring-accent-ink text-sm font-medium rounded-lg transition-all flex items-center gap-2 cursor-pointer shrink-0" data-act="add" data-kind="grp" data-id="${escapeHtml(cat._id)}">
                        <i class="fa-solid fa-plus"></i><span>เพิ่มกลุ่ม</span>
                    </button>
                </div>
                ${open ? `<div class="pb-3 space-y-1">${groupHtml || '<div class="pl-8 py-2 text-sm text-ink/60 italic">ยังไม่มีกลุ่มบัญชีในหมวดนี้</div>'}</div>` : ''}
            </div>`;
        }).join('');

        root.innerHTML = html || `<div class="py-12 text-center text-ink/60 italic">ไม่พบรายการที่ตรงกับตัวกรอง</div>`;

        const allOpen = cats.every(c => _treeOpen.has('cat:' + c._id));
        const toggleAll = document.querySelector('#btn-acct-tree-toggle-all p');
        if (toggleAll) toggleAll.textContent = allOpen ? 'ยุบทั้งหมด' : 'ขยายทั้งหมด';

        root.querySelectorAll('.acct-tree-fold').forEach(b => b.addEventListener('click', () => {
            const key = b.dataset.key;
            if (_treeOpen.has(key)) _treeOpen.delete(key); else _treeOpen.add(key);
            saveTreeOpen();
            renderAcctTree();
        }));
        root.querySelectorAll('.acct-tree-act').forEach(b => b.addEventListener('click', () => onTreeAction(b.dataset.act, b.dataset.kind, b.dataset.id)));
    }

    function onTreeAction(act, kind, id) {
        if (kind === 'grp') {
            if (act === 'add') return openAcctGroupModal({ category_id: id });
            const g = _coaCache.groups.find(x => x._id === id);
            if (!g) return;
            if (act === 'edit') return openAcctGroupModal(g);
            if (act === 'toggle') return toggleTreeActive('account-groups', g, 'กลุ่มบัญชี', g.group_code + ' ' + g.group_name,
                'รหัสบัญชีในกลุ่มนี้ยังอยู่ครบ แต่จะเพิ่มรหัสบัญชีใหม่เข้ากลุ่มไม่ได้จนกว่าจะเปิดกลับ');
            if (act === 'delete') return confirmTreeDelete('account-groups', 'กลุ่มบัญชี', g._id, g.group_code + ' ' + g.group_name);
        } else {
            if (act === 'add') return openAcctAccountModal({ group_id: id });
            const a = _coaCache.accounts.find(x => x._id === id);
            if (!a) return;
            if (act === 'edit') return openAcctAccountModal(a);
            if (act === 'toggle') return toggleTreeActive('chart-of-accounts', a, 'รหัสบัญชี', a.account_code + ' ' + a.account_name,
                'เอกสารเดิมและรายงานยังใช้รหัสนี้ได้ แต่จะเลือกใช้ในเอกสารใหม่ไม่ได้');
            if (act === 'delete') return confirmTreeDelete('chart-of-accounts', 'รหัสบัญชี', a._id, a.account_code + ' ' + a.account_name);
        }
    }

    // เปิดกลับทำทันที ส่วนปิดต้องยืนยัน — เหมือนหน้า #account-doc-links
    function toggleTreeActive(resource, item, noun, label, hint) {
        const run = (next) => treeRequest(`${API_BASE_URL}/acct/${resource}/${item._id}/active`, 'PATCH', { is_active: next },
            `${next ? 'เปิด' : 'ปิด'}การใช้งาน${noun}เรียบร้อย`);
        if (!isOn(item)) return run(true);
        showConfirm(`ปิดการใช้งาน${noun}`,
            `ต้องการปิดการใช้งาน <strong class="text-ink">${escapeHtml(label)}</strong> หรือไม่<br><span class="text-xs text-ink/70">${escapeHtml(hint)}</span>`,
            () => run(false), 'ปิดการใช้งาน', 'warning');
    }

    function confirmTreeDelete(resource, noun, id, label) {
        showConfirm(`ลบ${noun}`,
            `ต้องการลบ <strong class="text-ink">${escapeHtml(label)}</strong> หรือไม่<br><span class="text-xs text-ink/70">ลบแล้วกู้คืนไม่ได้ ถ้ามีการใช้งานอยู่ระบบจะไม่อนุญาตให้ลบ (ใช้ปิดการใช้งานแทนได้)</span>`,
            () => treeRequest(`${API_BASE_URL}/acct/${resource}/${id}`, 'DELETE', null, `ลบ${noun}เรียบร้อย`), 'ลบ', 'danger');
    }

    async function treeRequest(url, method, body, okMsg) {
        try {
            const res = await authFetch(url, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined
            });
            const data = await res.json();
            if (data.success) { showToast(okMsg, 'success'); await loadCOAData(); return true; }
            showToast('ทำรายการไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
        } catch (error) {
            console.error('Error treeRequest:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
        return false;
    }

    // ---------- โมดัลกลุ่มบัญชี ----------
    function openAcctGroupModal(data = {}) {
        const modal = document.getElementById('modal-acct-group');
        if (!modal) return;
        const cat = _coaCache.categories.find(c => c._id === idOf(data.category_id));
        document.getElementById('modal-acct-group-title').textContent = data._id ? 'แก้ไขกลุ่มบัญชี' : 'เพิ่มกลุ่มบัญชี';
        document.getElementById('acct-group-id').value = data._id || '';
        document.getElementById('acct-group-parent').value = cat ? cat._id : '';
        document.getElementById('acct-group-context').textContent = cat ? `หมวด ${cat.category_code} ${cat.category_name}` : '';
        const code = document.getElementById('acct-group-code');
        code.value = data.group_code || '';
        code.readOnly = !!data.is_system; // กลุ่มระบบเปลี่ยนรหัสไม่ได้ (seed อ้างด้วยรหัส)
        document.getElementById('acct-group-name').value = data.group_name || '';
        modal.classList.remove('hidden');
        (data.is_system ? document.getElementById('acct-group-name') : code).focus();
    }

    function closeAcctGroupModal() {
        document.getElementById('modal-acct-group')?.classList.add('hidden');
    }

    async function saveAcctGroup() {
        const _id = document.getElementById('acct-group-id')?.value;
        const payload = {
            group_code: (document.getElementById('acct-group-code')?.value || '').trim(),
            group_name: (document.getElementById('acct-group-name')?.value || '').trim(),
            category_id: document.getElementById('acct-group-parent')?.value || ''
        };
        if (_id) payload._id = _id;
        if (!payload.group_code || !payload.group_name) { showToast('กรุณากรอกรหัสและชื่อกลุ่มให้ครบ', 'warning'); return; }
        const btn = document.getElementById('acct-group-save');
        if (btn) btn.disabled = true; // กันกดซ้ำ — POST ไม่ retry
        const ok = await treeRequest(`${API_BASE_URL}/acct/account-groups`, 'POST', payload, _id ? 'แก้ไขกลุ่มบัญชีเรียบร้อย' : 'เพิ่มกลุ่มบัญชีเรียบร้อย');
        if (btn) btn.disabled = false;
        if (ok) {
            closeAcctGroupModal();
            if (payload.category_id) { _treeOpen.add('cat:' + payload.category_id); saveTreeOpen(); renderAcctTree(); }
        }
    }

    // ---------- โมดัลรหัสบัญชี ----------
    function openAcctAccountModal(data = {}) {
        const modal = document.getElementById('modal-acct-account');
        if (!modal) return;
        const group = _coaCache.groups.find(g => g._id === idOf(data.group_id));
        if (!group) { showToast('ไม่พบกลุ่มบัญชี', 'warning'); return; }
        if (!data._id && !isOn(group)) { showToast('กลุ่มบัญชีนี้ปิดการใช้งานอยู่ เปิดการใช้งานกลุ่มก่อนจึงจะเพิ่มรหัสบัญชีได้', 'warning'); return; }
        const cat = _coaCache.categories.find(c => c._id === idOf(group.category_id));
        document.getElementById('modal-acct-account-title').textContent = data._id ? 'แก้ไขรหัสบัญชี' : 'เพิ่มรหัสบัญชี';
        document.getElementById('acct-account-id').value = data._id || '';
        document.getElementById('acct-account-parent').value = group._id;
        document.getElementById('acct-account-context').textContent =
            `กลุ่ม ${group.group_code} ${group.group_name}${cat ? ' · หมวด' + cat.category_name : ''}`;
        const code = document.getElementById('acct-account-code');
        code.value = data.account_code || '';
        code.readOnly = !!data.is_system; // บัญชีระบบเปลี่ยนรหัสไม่ได้
        document.getElementById('acct-account-name').value = data.account_name || '';
        modal.classList.remove('hidden');
        (data.is_system ? document.getElementById('acct-account-name') : code).focus();
    }

    function closeAcctAccountModal() {
        document.getElementById('modal-acct-account')?.classList.add('hidden');
    }

    async function saveAcctAccount() {
        const _id = document.getElementById('acct-account-id')?.value;
        const group = _coaCache.groups.find(g => g._id === document.getElementById('acct-account-parent')?.value);
        const payload = {
            account_code: (document.getElementById('acct-account-code')?.value || '').trim(),
            account_name: (document.getElementById('acct-account-name')?.value || '').trim(),
            category_id: group ? idOf(group.category_id) : '',
            group_id: group ? group._id : null
        };
        if (_id) payload._id = _id;
        if (!payload.account_code || !payload.account_name) { showToast('กรุณากรอกรหัสและชื่อบัญชีให้ครบ', 'warning'); return; }
        const btn = document.getElementById('acct-account-save');
        if (btn) btn.disabled = true;
        const ok = await treeRequest(`${API_BASE_URL}/acct/chart-of-accounts`, 'POST', payload, _id ? 'แก้ไขรหัสบัญชีเรียบร้อย' : 'เพิ่มรหัสบัญชีเรียบร้อย');
        if (btn) btn.disabled = false;
        if (ok) {
            closeAcctAccountModal();
            if (group) { _treeOpen.add('cat:' + idOf(group.category_id)); _treeOpen.add('grp:' + group._id); saveTreeOpen(); renderAcctTree(); }
        }
    }

    // ---------- หน้า "เชื่อมสมุดบัญชีกับเอกสาร" (#account-doc-links) ----------
    // เมนูเดียว 2 หน้า (แท็บ): "เชื่อมบัญชี" = เอกสาร ↔ สมุดบัญชี / "รายการเอกสาร" = ชื่อเอกสารทั้งหมด
    // ไม่มีปุ่มลบ — ใช้ "ปิดการใช้งาน" แทน เพราะการเชื่อมเดิมยังอ้างถึงเอกสารอยู่ และเปิดกลับมาใช้ได้เสมอ
    const DOCLINK_COLS = 4, DOC_COLS = 4;
    const DOCLINK_TAB_KEY = 'acct_doclink_tab';
    let _acctDocs = [];
    let _acctDocLinks = [];
    let _acctDocBooks = [];
    let _docLinkLoaded = false;
    let _docLinkTab = 'links';
    let _docLinkBound = false;

    const DOCLINK_TAB_ON = 'border border-transparent px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer bg-primary text-on-primary ring-1 ring-accent-ink';
    const DOCLINK_TAB_OFF = 'elev-field px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer bg-field text-body-muted hover:ring-1 hover:ring-accent-ink hover:text-ink';
    const DOCLINK_BADGE_ON = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-hairline/20';
    const DOCLINK_BADGE_OFF = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-chip/60 text-ink';
    // ปุ่มหัวหน้า: ปุ่มของแท็บที่เปิดอยู่เป็นปุ่มทึบ (หลัก) อีกปุ่มเป็น ghost — DESIGN.md "1 ปุ่มทึบ + 1 ghost"
    const DOCLINK_BTN_SOLID = 'px-4 py-2 bg-primary hover:bg-[#E2B93C] text-on-primary font-medium rounded-xl transition-all flex items-center gap-2 w-fit cursor-pointer';
    const DOCLINK_BTN_GHOST = 'elev-field px-4 py-2 bg-field text-ink hover:ring-1 hover:ring-accent-ink font-medium rounded-xl transition-all flex items-center gap-2 w-fit cursor-pointer';

    // สถานะที่แสดงคือสถานะ "ใช้งานได้จริง": การเชื่อมที่เปิดอยู่แต่เอกสารถูกปิด ก็ใช้งานไม่ได้เช่นกัน
    const DOCLINK_STATES = {
        active: { label: 'ใช้งาน', dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok' },
        off: { label: 'ปิดใช้งาน', dot: 'bg-ink/40', bg: 'bg-chip/60', text: 'text-ink' },
        docOff: { label: 'เอกสารปิดใช้งาน', dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' }
    };

    const docLinkBadge = (stateKey) => {
        const s = DOCLINK_STATES[stateKey];
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${s.bg}">
                    <div class="w-2 h-2 rounded-full ${s.dot}"></div>
                    <span class="${s.text} font-medium text-xs">${s.label}</span>
                </div>`;
    };

    // ปุ่มแก้ไข + ปุ่มเปิด/ปิดการใช้งาน (ไอคอน ban = ปิด / circle-check = เปิดกลับ)
    const docLinkActionButtons = (kind, id, isActive, label) => `
        <div class="flex items-center justify-end gap-1">
            <button type="button" class="btn-doclink-edit text-ink hover:text-amber-400 transition-colors p-2 cursor-pointer"
                data-kind="${kind}" data-id="${escapeHtml(id)}" title="แก้ไข"
                aria-label="แก้ไข ${escapeHtml(label)}">
                <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="btn-doclink-toggle text-ink ${isActive ? 'hover:text-red-400' : 'hover:text-state-ok'} transition-colors p-2 cursor-pointer"
                data-kind="${kind}" data-id="${escapeHtml(id)}" title="${isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}"
                aria-label="${isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'} ${escapeHtml(label)}">
                <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-circle-check'}"></i>
            </button>
        </div>`;

    async function initAccountDocLinks() {
        if (!_docLinkBound) {
            // ผูกครั้งเดียว — loadPageView แทรก HTML ครั้งเดียว แต่ initAccountDocLinks ถูกเรียกทุกครั้งที่เข้าหน้า
            _docLinkBound = true;
            document.getElementById('tab-acct-doclinks')?.addEventListener('click', () => setDocLinkTab('links'));
            document.getElementById('tab-acct-docs')?.addEventListener('click', () => setDocLinkTab('docs'));
            document.getElementById('acct-doclink-search')?.addEventListener('input', () => renderAcctDocLinksPage());
            document.getElementById('acct-doclink-status')?.addEventListener('change', () => renderAcctDocLinksPage());
        }
        const search = document.getElementById('acct-doclink-search');
        if (search) search.value = '';
        const status = document.getElementById('acct-doclink-status');
        if (status) status.value = '';

        let saved = 'links';
        try { saved = localStorage.getItem(DOCLINK_TAB_KEY) === 'docs' ? 'docs' : 'links'; } catch (e) { }
        setDocLinkTab(saved, { render: false });

        coaSkeleton('acct-doclink-table-body', DOCLINK_COLS);
        coaSkeleton('acct-doc-table-body', DOC_COLS);
        await loadAcctDocData();
    }

    function setDocLinkTab(tab, { render = true } = {}) {
        _docLinkTab = tab === 'docs' ? 'docs' : 'links';
        try { localStorage.setItem(DOCLINK_TAB_KEY, _docLinkTab); } catch (e) { }
        const onLinks = _docLinkTab === 'links';

        const tabLinks = document.getElementById('tab-acct-doclinks');
        const tabDocs = document.getElementById('tab-acct-docs');
        if (tabLinks) { tabLinks.className = onLinks ? DOCLINK_TAB_ON : DOCLINK_TAB_OFF; tabLinks.setAttribute('aria-pressed', String(onLinks)); }
        if (tabDocs) { tabDocs.className = onLinks ? DOCLINK_TAB_OFF : DOCLINK_TAB_ON; tabDocs.setAttribute('aria-pressed', String(!onLinks)); }
        const badgeLinks = document.getElementById('badge-acct-doclinks');
        const badgeDocs = document.getElementById('badge-acct-docs');
        if (badgeLinks) badgeLinks.className = onLinks ? DOCLINK_BADGE_ON : DOCLINK_BADGE_OFF;
        if (badgeDocs) badgeDocs.className = onLinks ? DOCLINK_BADGE_OFF : DOCLINK_BADGE_ON;

        document.getElementById('acct-doclink-panel-links')?.classList.toggle('hidden', !onLinks);
        document.getElementById('acct-doclink-panel-docs')?.classList.toggle('hidden', onLinks);

        coaSetText('acct-doclink-title', onLinks ? 'รายการเชื่อมสมุดบัญชีกับเอกสาร' : 'รายการเอกสาร');
        const titleIcon = document.getElementById('acct-doclink-title-icon');
        if (titleIcon) titleIcon.className = `fa-solid ${onLinks ? 'fa-sitemap' : 'fa-file-lines'} text-accent-ink`;
        const search = document.getElementById('acct-doclink-search');
        if (search) search.placeholder = onLinks ? 'ค้นหารหัส / ชื่อเอกสาร / สมุดบัญชี...' : 'ค้นหารหัส / ชื่อเอกสาร...';

        // ปุ่มของแท็บที่เปิดอยู่เป็นปุ่มทึบ
        const btnDoc = document.getElementById('btn-add-acct-doc');
        const btnLink = document.getElementById('btn-add-acct-doclink');
        if (btnDoc) btnDoc.className = onLinks ? DOCLINK_BTN_GHOST : DOCLINK_BTN_SOLID;
        if (btnLink) btnLink.className = onLinks ? DOCLINK_BTN_SOLID : DOCLINK_BTN_GHOST;

        if (render) renderAcctDocLinksPage();
    }

    async function loadAcctDocData() {
        const showError = (msg) => {
            const tbLinks = document.getElementById('acct-doclink-table-body');
            const tbDocs = document.getElementById('acct-doc-table-body');
            if (tbLinks) tbLinks.innerHTML = coaStateRow(DOCLINK_COLS, msg, 'text-red-400');
            if (tbDocs) tbDocs.innerHTML = coaStateRow(DOC_COLS, msg, 'text-red-400');
        };
        try {
            // 3 รายการดึงพร้อมกัน จ่าย latency รอบเดียว — ชื่อเอกสาร/สมุดบัญชีจับคู่ฝั่งหน้าเว็บ
            const responses = await Promise.all([
                authFetch(`${API_BASE_URL}/acct/account-documents`),
                authFetch(`${API_BASE_URL}/acct/account-book-links`),
                authFetch(`${API_BASE_URL}/acct/account-books`)
            ]);
            const [docData, linkData, bookData] = await Promise.all(responses.map(r => r.json()));
            const failed = [docData, linkData, bookData].find(d => !d.success);
            if (failed) {
                showError(failed.message || 'ดึงข้อมูลไม่สำเร็จ');
                return;
            }
            _acctDocs = docData.documents || [];
            _acctDocLinks = linkData.links || [];
            _acctDocBooks = bookData.books || [];
            _docLinkLoaded = true;
            renderAcctDocLinksPage();
        } catch (error) {
            console.error('Error loadAcctDocData:', error);
            showError('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด');
        }
    }

    function renderAcctDocLinksPage() {
        const q = (document.getElementById('acct-doclink-search')?.value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('acct-doclink-status')?.value || '';
        const th = (a, b) => String(a || '').localeCompare(String(b || ''), 'th');

        coaSetText('badge-acct-doclinks', _acctDocLinks.length);
        coaSetText('badge-acct-docs', _acctDocs.length);

        if (_docLinkTab === 'docs') {
            const tbody = document.getElementById('acct-doc-table-body');
            if (!tbody) return;
            const rows = _acctDocs
                .filter(d => (statusFilter === 'active' ? d.is_active : statusFilter === 'off' ? !d.is_active : true))
                .filter(d => !q || (d.doc_code || '').toLowerCase().includes(q) || (d.doc_name || '').toLowerCase().includes(q))
                .sort((a, b) => th(a.doc_code, b.doc_code) || th(a.doc_name, b.doc_name));
            coaSetText('acct-doclink-result-count', _acctDocs.length ? `แสดง ${rows.length} จาก ${_acctDocs.length} รายการ` : '');

            if (!rows.length) {
                tbody.innerHTML = coaStateRow(DOC_COLS, _acctDocs.length
                    ? 'ไม่พบเอกสารที่ตรงกับตัวกรอง'
                    : 'ยังไม่มีเอกสาร กด "เพิ่มเอกสาร" เพื่อเริ่มใช้งาน');
                return;
            }
            tbody.innerHTML = rows.map(d => `
                <tr class="hover:bg-divider transition-colors">
                    <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${escapeHtml(d.doc_code || '-')}</span></td>
                    <td class="px-6 py-4 ${d.is_active ? 'text-ink' : 'text-ink/60'} font-medium">${escapeHtml(d.doc_name)}</td>
                    <td class="px-6 py-4 text-center">${docLinkBadge(d.is_active ? 'active' : 'off')}</td>
                    <td class="px-6 py-4 text-right">${docLinkActionButtons('doc', d._id, d.is_active, (d.doc_code ? d.doc_code + ' ' : '') + d.doc_name)}</td>
                </tr>`).join('');
            bindDocLinkRowButtons(tbody);
            return;
        }

        const tbody = document.getElementById('acct-doclink-table-body');
        if (!tbody) return;
        const docById = new Map(_acctDocs.map(d => [String(d._id), d]));
        const bookById = new Map(_acctDocBooks.map(b => [String(b._id), b]));
        const rows = _acctDocLinks.map(link => {
            const doc = docById.get(String(link.document_id));
            const book = bookById.get(String(link.book_id));
            const state = !link.is_active ? 'off' : (doc && !doc.is_active ? 'docOff' : 'active');
            return { link, doc, book, state };
        }).filter(r => {
            if (statusFilter === 'active' && r.state !== 'active') return false;
            if (statusFilter === 'off' && r.state === 'active') return false;
            if (!q) return true;
            return (r.doc?.doc_code || '').toLowerCase().includes(q) ||
                (r.doc?.doc_name || '').toLowerCase().includes(q) ||
                (r.book?.book_code || '').toLowerCase().includes(q) ||
                (r.book?.book_name || '').toLowerCase().includes(q);
        }).sort((a, b) => th(a.doc?.doc_code, b.doc?.doc_code) || th(a.doc?.doc_name, b.doc?.doc_name) || th(a.book?.book_code, b.book?.book_code));
        coaSetText('acct-doclink-result-count', _acctDocLinks.length ? `แสดง ${rows.length} จาก ${_acctDocLinks.length} รายการ` : '');

        if (!rows.length) {
            tbody.innerHTML = coaStateRow(DOCLINK_COLS, _acctDocLinks.length
                ? 'ไม่พบการเชื่อมที่ตรงกับตัวกรอง'
                : 'ยังไม่มีการเชื่อม กด "เพิ่มการเชื่อม" เพื่อเริ่มใช้งาน');
            return;
        }
        tbody.innerHTML = rows.map(r => {
            const dim = r.state === 'active' ? 'text-ink' : 'text-ink/60';
            const docName = r.doc
                ? `${r.doc.doc_code ? `<span class="font-mono font-semibold text-accent-ink">${escapeHtml(r.doc.doc_code)}</span> ` : ''}${escapeHtml(r.doc.doc_name)}`
                : '<span class="italic">(เอกสารถูกลบแล้ว)</span>';
            const bookCell = r.book
                ? `<span class="font-mono font-semibold text-accent-ink">${escapeHtml(r.book.book_code)}</span> <span class="${dim}">${escapeHtml(r.book.book_name)}</span>`
                : '<span class="italic text-ink/60">(สมุดบัญชีถูกลบแล้ว)</span>';
            const label = `${r.doc ? (r.doc.doc_code ? r.doc.doc_code + ' ' : '') + r.doc.doc_name : 'เอกสาร'} ↔ ${r.book ? r.book.book_code : 'สมุดบัญชี'}`;
            return `
                <tr class="hover:bg-divider transition-colors">
                    <td class="px-6 py-4 ${dim} font-medium">${docName}</td>
                    <td class="px-6 py-4">${bookCell}</td>
                    <td class="px-6 py-4 text-center">${docLinkBadge(r.state)}</td>
                    <td class="px-6 py-4 text-right">${docLinkActionButtons('link', r.link._id, r.link.is_active, label)}</td>
                </tr>`;
        }).join('');
        bindDocLinkRowButtons(tbody);
    }

    // ผูกปุ่มแก้ไข/เปิด-ปิด ของทั้งสองตาราง — data-kind บอกว่าเป็นแถวเอกสาร (doc) หรือแถวการเชื่อม (link)
    function bindDocLinkRowButtons(tbody) {
        const find = (btn) => (btn.dataset.kind === 'doc' ? _acctDocs : _acctDocLinks).find(x => x._id === btn.dataset.id);
        tbody.querySelectorAll('.btn-doclink-edit').forEach(btn => btn.addEventListener('click', () => {
            const item = find(btn);
            if (!item) return;
            if (btn.dataset.kind === 'doc') openAcctDocModal(item); else openAcctDocLinkModal(item);
        }));
        tbody.querySelectorAll('.btn-doclink-toggle').forEach(btn => btn.addEventListener('click', () => {
            const item = find(btn);
            if (!item) return;
            if (btn.dataset.kind === 'doc') toggleAcctDoc(item); else toggleAcctDocLink(item);
        }));
    }

    // ---------- เปิด/ปิดการใช้งาน ----------
    // เปิดกลับทำทันที (ไม่มีอะไรเสียหาย) ส่วนปิดต้องยืนยันก่อน เพราะกระทบสิ่งที่เชื่อมอยู่
    function toggleAcctDoc(doc) {
        if (!doc.is_active) { setAcctActive('account-documents', doc._id, true, 'เปิดการใช้งานเอกสารเรียบร้อย'); return; }
        showConfirm('ปิดการใช้งานเอกสาร',
            `ต้องการปิดการใช้งาน <strong class="text-ink">${doc.doc_code ? escapeHtml(doc.doc_code) + ' ' : ''}${escapeHtml(doc.doc_name)}</strong> หรือไม่<br><span class="text-xs text-ink/70">การเชื่อมสมุดบัญชีของเอกสารนี้จะใช้งานไม่ได้จนกว่าจะเปิดกลับ</span>`,
            () => setAcctActive('account-documents', doc._id, false, 'ปิดการใช้งานเอกสารเรียบร้อย'), 'ปิดการใช้งาน', 'warning');
    }

    function toggleAcctDocLink(link) {
        if (!link.is_active) { setAcctActive('account-book-links', link._id, true, 'เปิดการใช้งานการเชื่อมเรียบร้อย'); return; }
        const doc = _acctDocs.find(d => d._id === link.document_id);
        const book = _acctDocBooks.find(b => b._id === link.book_id);
        const label = `<strong class="text-ink">${escapeHtml(doc ? doc.doc_name : '-')}</strong> ↔ <strong class="font-mono text-accent-ink">${escapeHtml(book ? book.book_code : '-')}</strong>`;
        showConfirm('ปิดการใช้งานการเชื่อม',
            `ต้องการปิดการใช้งานการเชื่อม ${label} หรือไม่<br><span class="text-xs text-ink/70">เปิดกลับมาใช้ใหม่ได้ภายหลัง</span>`,
            () => setAcctActive('account-book-links', link._id, false, 'ปิดการใช้งานการเชื่อมเรียบร้อย'), 'ปิดการใช้งาน', 'warning');
    }

    async function setAcctActive(resource, id, isActive, successMsg) {
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/${resource}/${id}/active`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive })
            });
            const data = await res.json();
            if (data.success) {
                showToast(successMsg, 'success');
                loadAcctDocData();
            } else {
                showToast('ทำรายการไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error setAcctActive:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        }
    }

    // ---------- โมดัลเอกสาร ----------
    function openAcctDocModal(editData = null) {
        const modal = document.getElementById('modal-acct-doc');
        if (!modal) return;
        document.getElementById('modal-acct-doc-title').textContent = editData ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสาร';
        document.getElementById('acct-doc-id').value = editData?._id || '';
        document.getElementById('acct-doc-code').value = editData?.doc_code || '';
        document.getElementById('acct-doc-name').value = editData?.doc_name || '';
        modal.classList.remove('hidden');
        document.getElementById('acct-doc-code')?.focus();
    }

    function closeAcctDocModal() {
        const modal = document.getElementById('modal-acct-doc');
        if (modal) modal.classList.add('hidden');
    }

    async function saveAcctDoc() {
        const _id = document.getElementById('acct-doc-id')?.value;
        const payload = {
            doc_code: (document.getElementById('acct-doc-code')?.value || '').trim(),
            doc_name: (document.getElementById('acct-doc-name')?.value || '').trim()
        };
        if (_id) payload._id = _id;
        if (!payload.doc_code || !payload.doc_name) {
            showToast('กรุณากรอกรหัสและชื่อเอกสารให้ครบ', 'warning');
            return;
        }

        const btn = document.getElementById('acct-doc-save');
        if (btn) btn.disabled = true; // กันกดซ้ำ — POST ไม่ retry และไม่ควรยิงซ้ำ
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/account-documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast(_id ? 'แก้ไขเอกสารเรียบร้อย' : 'เพิ่มเอกสารเรียบร้อย', 'success');
                closeAcctDocModal();
                loadAcctDocData();
            } else {
                showToast('บันทึกเอกสารไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error saveAcctDoc:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ---------- โมดัลการเชื่อม ----------
    function openAcctDocLinkModal(editData = null) {
        const modal = document.getElementById('modal-acct-doclink');
        if (!modal) return;
        if (!_docLinkLoaded) {
            showToast('กำลังโหลดข้อมูล กรุณารอสักครู่', 'warning');
            return;
        }
        // เลือกได้เฉพาะเอกสารที่เปิดใช้งาน — ยกเว้นตอนแก้การเชื่อมเดิม ให้เห็นเอกสารเดิมของมันเสมอ
        const currentDocId = editData ? String(editData.document_id) : '';
        const docs = _acctDocs.filter(d => d.is_active || String(d._id) === currentDocId)
            .sort((a, b) => String(a.doc_code || '').localeCompare(String(b.doc_code || ''), 'th') || String(a.doc_name).localeCompare(String(b.doc_name), 'th'));
        if (!docs.length) {
            showToast('ยังไม่มีเอกสารที่เปิดใช้งาน กรุณาเพิ่มเอกสารก่อน', 'warning');
            return;
        }
        if (!_acctDocBooks.length) {
            showToast('ยังไม่มีสมุดบัญชีให้เลือกเชื่อม', 'warning');
            return;
        }

        document.getElementById('modal-acct-doclink-title').textContent = editData ? 'แก้ไขการเชื่อม' : 'เพิ่มการเชื่อม';
        document.getElementById('acct-doclink-id').value = editData?._id || '';

        const docSel = document.getElementById('acct-doclink-document');
        docSel.innerHTML = '<option value="">-- เลือกเอกสาร --</option>' + docs.map(d =>
            `<option value="${escapeHtml(d._id)}">${d.doc_code ? escapeHtml(d.doc_code) + ' · ' : ''}${escapeHtml(d.doc_name)}${d.is_active ? '' : ' (ปิดใช้งาน)'}</option>`).join('');
        docSel.value = currentDocId;

        const bookSel = document.getElementById('acct-doclink-book');
        bookSel.innerHTML = '<option value="">-- เลือกสมุดบัญชี --</option>' + _acctDocBooks.map(b =>
            `<option value="${escapeHtml(b._id)}">${escapeHtml(b.book_code)} · ${escapeHtml(b.book_name)}</option>`).join('');
        bookSel.value = editData ? String(editData.book_id) : '';

        modal.classList.remove('hidden');
        docSel.focus();
    }

    function closeAcctDocLinkModal() {
        const modal = document.getElementById('modal-acct-doclink');
        if (modal) modal.classList.add('hidden');
    }

    async function saveAcctDocLink() {
        const _id = document.getElementById('acct-doclink-id')?.value;
        const payload = {
            document_id: document.getElementById('acct-doclink-document')?.value || '',
            book_id: document.getElementById('acct-doclink-book')?.value || ''
        };
        if (_id) payload._id = _id;
        if (!payload.document_id || !payload.book_id) {
            showToast('กรุณาเลือกเอกสารและสมุดบัญชีให้ครบ', 'warning');
            return;
        }

        const btn = document.getElementById('acct-doclink-save');
        if (btn) btn.disabled = true; // กันกดซ้ำ — POST ไม่ retry และไม่ควรยิงซ้ำ
        try {
            const res = await authFetch(`${API_BASE_URL}/acct/account-book-links`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast(_id ? 'แก้ไขการเชื่อมเรียบร้อย' : 'เพิ่มการเชื่อมเรียบร้อย', 'success');
                closeAcctDocLinkModal();
                loadAcctDocData();
            } else {
                showToast('บันทึกการเชื่อมไม่สำเร็จ: ' + (data.message || 'ไม่ทราบสาเหตุ'), 'error');
            }
        } catch (error) {
            console.error('Error saveAcctDocLink:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด: ' + error.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
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

        const rows = configs || [];
        coaSetText('badge-coa-pnl', rows.length);

        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = coaStateRow(PNL_COLS, 'ยังไม่มีรายการงบกำไรขาดทุน กด "เพิ่มรายการ" เพื่อเริ่มตั้งค่า');
            return;
        }
        rows.forEach((conf, idx) => tbody.appendChild(createPnLRow(conf, idx)));
    }

    function createPnLRow(conf = {}, idx = 0) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-divider transition-colors pnl-row';

        let accOptions = '<option value="">เลือกบัญชี (ออโต้รวม)</option>';
        _coaCache.accounts.forEach(a => {
            const isSelected = conf.account_ids && conf.account_ids.some(acc => idOf(acc) === a._id);
            // บัญชีที่ปิดการใช้งานไม่แสดงให้เลือกใหม่ แต่ถ้าบรรทัดนี้เลือกไว้อยู่แล้วต้องคงไว้ ไม่งั้นบันทึกแล้วจะหลุดหาย
            if (a.is_active === false && !isSelected) return;
            accOptions += `<option value="${a._id}" ${isSelected ? 'selected' : ''}>${escapeHtml(a.account_code)} - ${escapeHtml(a.account_name)}</option>`;
        });

        const sections = [{ value: 'revenue', label: 'รายได้' }, { value: 'expense', label: 'ค่าใช้จ่าย' }];
        const secOptions = sections.map(s =>
            `<option value="${s.value}" ${s.value === conf.section ? 'selected' : ''}>${s.label}</option>`).join('');

        // ช่องกรอกในตารางใช้โทเคนชุดเดียวกับฟอร์ม (ข้อ 11.9) แต่ย่อ padding ให้พอดีความสูงแถว
        const field = 'elev-field w-full px-3 py-2 rounded-xl bg-field text-ink focus:ring-2 focus:ring-accent-ink focus:outline-none transition-all text-sm';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <input type="number" inputmode="numeric" aria-label="ลำดับการแสดง"
                    class="pnl-sort ${field} text-center font-mono" value="${conf.sort_order ?? (idx + 1) * 10}">
            </td>
            <td class="px-6 py-4">
                <input type="text" aria-label="ชื่อรายการ" placeholder="ชื่อรายการ"
                    class="pnl-name ${field} placeholder-ink-muted-48 min-w-[160px]" value="${escapeHtml(conf.display_name || '')}">
            </td>
            <td class="px-6 py-4">
                <div class="relative min-w-[130px]">
                    <select class="pnl-section ${field} appearance-none pr-9 cursor-pointer" aria-label="ส่วนของงบ">
                        ${secOptions}
                    </select>
                    <div class="absolute right-3 top-[11px] pointer-events-none text-body-muted">
                        <i class="fa-solid fa-chevron-down text-xs"></i>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="relative min-w-[220px]">
                    <select class="pnl-account ${field} appearance-none pr-9 cursor-pointer" aria-label="บัญชีที่เชื่อมโยง">
                        ${accOptions}
                    </select>
                    <div class="absolute right-3 top-[11px] pointer-events-none text-body-muted">
                        <i class="fa-solid fa-chevron-down text-xs"></i>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 text-center">
                <input type="checkbox" aria-label="แสดงเป็นตัวหนา"
                    class="elev-field pnl-bold w-4 h-4 rounded bg-field accent-accent-ink cursor-pointer"
                    ${conf.is_bold ? 'checked' : ''}>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-1">
                    <button type="button" class="btn-pnl-remove text-ink hover:text-red-400 transition-colors p-2 cursor-pointer"
                        title="ลบรายการนี้" aria-label="ลบรายการงบกำไรขาดทุน">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        const rm = tr.querySelector('.btn-pnl-remove');
        if (rm) rm.addEventListener('click', () => removePnLLine(rm));
        return tr;
    }

    function addPnLLine() {
        const tbody = document.getElementById('pnl-config-table-body');
        if (!tbody) return;
        // แถวสถานะว่างไม่ใช่ข้อมูลจริง ต้องเคลียร์ก่อนเพิ่มแถวแรก
        if (!tbody.querySelector('.pnl-row')) tbody.innerHTML = '';
        tbody.appendChild(createPnLRow({}, tbody.children.length));
        coaSetText('badge-coa-pnl', tbody.querySelectorAll('.pnl-row').length);
    }

    // การลบเป็นการกระทำที่ย้อนไม่ได้ ต้องผ่าน showConfirm() ของระบบ (ข้อ 11.12 ข้อ 11)
    // ของเดิมใช้ confirm() ของเบราว์เซอร์ ซึ่งหน้าตาไม่เข้ากับธีมและบล็อกทั้งหน้า
    function removePnLLine(btn) {
        const tr = btn.closest('tr');
        if (!tr) return;
        const name = (tr.querySelector('.pnl-name')?.value || '').trim();
        showConfirm(
            'ลบรายการงบกำไรขาดทุน',
            name
                ? `ต้องการลบรายการ <strong class="text-ink">${escapeHtml(name)}</strong> ออกจากงบกำไรขาดทุนหรือไม่<br><span class="text-xs text-ink/70">การเปลี่ยนแปลงจะมีผลเมื่อกดบันทึก</span>`
                : 'ต้องการลบรายการนี้ออกจากงบกำไรขาดทุนหรือไม่',
            () => {
                tr.remove();
                const tbody = document.getElementById('pnl-config-table-body');
                if (tbody) {
                    const left = tbody.querySelectorAll('.pnl-row').length;
                    coaSetText('badge-coa-pnl', left);
                    if (!left) tbody.innerHTML = coaStateRow(PNL_COLS, 'ยังไม่มีรายการงบกำไรขาดทุน กด "เพิ่มรายการ" เพื่อเริ่มตั้งค่า');
                }
            },
            'ลบรายการ',
            'danger'
        );
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
            // บัญชีที่ปิดการใช้งาน (is_active === false) ไม่ให้เลือกในใบสำคัญจ่ายใหม่
            const debits = _coaCache.accounts.filter(a => (a.account_code.startsWith('2') || a.account_code.startsWith('5')) && a.level === 3 && a.is_active !== false);
            debits.forEach(a => {
                debitOpts += `<option value="${a._id}">${a.account_code} - ${a.account_name}</option>`;
            });
            debitSelect.innerHTML = debitOpts;
        }

        if (creditSelect) {
            let creditOpts = '<option value="">-- เลือกบัญชีเครดิต --</option>';
            // Credit: strictly Liquid Assets (11xxxx)
            const credits = _coaCache.accounts.filter(a => a.account_code.startsWith('11') && a.level === 3 && a.is_active !== false);
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

    // ---------- ตารางประวัติใบสำคัญจ่าย (DESIGN.md ข้อ 11.5 - 11.7) ----------
    const DV_COLS = 6;
    let _dvCache = [];
    let _dvSearch = '';
    let _dvBound = false;
    // มุมมองตาราง/การ์ด — จำค่าไว้ข้ามการเข้าหน้า (เหมือนหน้า #deposits)
    let dvViewMode = localStorage.getItem('dv_view_mode') === 'card' ? 'card' : 'list';

    const dvBaht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const dvDate = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        if (isNaN(dt)) return '-';
        return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const dvStateRow = (msg, cls = 'text-ink/50 italic') =>
        `<tr><td colspan="${DV_COLS}" class="px-6 py-8 text-center ${cls}">${escapeHtml(msg)}</td></tr>`;

    const dvStateCard = (msg, cls = 'text-ink/50 italic') =>
        `<div class="col-span-full py-12 text-center ${cls}">${escapeHtml(msg)}</div>`;

    const dvTableSkeleton = (rows = 4) => {
        const tbody = document.getElementById('dv-history-table-body');
        if (!tbody) return;
        const bar = '<div class="h-3.5 w-full rounded-full bg-skeleton animate-pulse"></div>';
        tbody.innerHTML = Array.from({ length: rows }).map(() =>
            `<tr>${Array.from({ length: DV_COLS }).map(() =>
                `<td class="px-6 py-4">${bar}</td>`).join('')}</tr>`).join('');
    };

    // โครงร่างการ์ด — สัดส่วนบล็อกเดินตามโครงจริงของ dvCardMarkup ด้านล่าง
    const dvCardSkeleton = (count = 4) => {
        const cardsWrap = document.getElementById('dv-view-cards');
        if (!cardsWrap) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        cardsWrap.innerHTML = Array.from({ length: count }).map(() => `
            <div class="elev-card bg-surface-tile-3 rounded-md p-3.5">
                <div class="flex items-start justify-between gap-2">${bar('w-28')}${bar('w-20')}</div>
                ${bar('w-32 mt-2.5')}
                <div class="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-hairline">
                    <div class="space-y-2">${bar('w-16')}${bar('w-24')}</div>
                    <div class="space-y-2">${bar('w-16')}${bar('w-24')}</div>
                </div>
                <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                    ${bar('w-20')}
                    <div class="w-8 h-8 rounded-lg bg-skeleton animate-pulse"></div>
                </div>
            </div>`).join('');
    };

    const dvSkeleton = (rows = 4) => {
        syncViewWrapVisibility('dv', dvViewMode);
        if (dvViewMode === 'card') dvCardSkeleton(rows); else dvTableSkeleton(rows);
    };

    const dvAccountCell = (acc) => {
        if (!acc) return '<span class="text-ink/50">-</span>';
        return `<p class="font-mono text-accent-ink text-xs">${escapeHtml(acc.account_code || '-')}</p>
                <p class="text-ink text-xs mt-0.5">${escapeHtml(acc.account_name || '-')}</p>`;
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const dvRenderChips = () => {
        const box = document.getElementById('dv-active-filters');
        if (!box) return;
        box.innerHTML = '';

        const startEl = document.getElementById('dv-filter-start');
        const endEl = document.getElementById('dv-filter-end');
        const chips = [];
        if (_dvSearch.trim()) chips.push({ key: 'search', label: `ค้นหา: ${_dvSearch.trim()}` });
        if (startEl && startEl.value) chips.push({ key: 'start', label: `ตั้งแต่: ${dvDate(startEl.value)}` });
        if (endEl && endEl.value) chips.push({ key: 'end', label: `ถึง: ${dvDate(endEl.value)}` });

        const clearOne = (key) => {
            if (key === 'search') {
                _dvSearch = '';
                const s = document.getElementById('dv-search');
                if (s) s.value = '';
                dvRenderTable();
                return;
            }
            const el = document.getElementById(key === 'start' ? 'dv-filter-start' : 'dv-filter-end');
            if (el) el.value = '';
            loadDisbursements();   // ช่วงวันที่กรองที่ฝั่งเซิร์ฟเวอร์ ต้องดึงใหม่
        };

        chips.forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40' +
                'text-ink text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
            chip.innerHTML = `<span>${escapeHtml(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.setAttribute('aria-label', `ลบตัวกรอง ${c.label}`);
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return;
                clearOne(c.key);
            });
            box.appendChild(chip);
        });

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น
        if (chips.length > 1) {
            const clearAll = document.createElement('button');
            clearAll.type = 'button';
            clearAll.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 ' +
                'rounded-full text-xs font-medium ring-1 ring-red-500/30 transition-colors cursor-pointer';
            clearAll.textContent = 'ล้างทั้งหมด';
            clearAll.addEventListener('click', () => {
                _dvSearch = '';
                ['dv-search', 'dv-filter-start', 'dv-filter-end'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                loadDisbursements();
            });
            box.appendChild(clearAll);
        }
    };

    // ข้อมูลที่คำนวณร่วมกันระหว่างแถวตารางกับการ์ด — แยกออกมาครั้งเดียวเพื่อไม่ให้สองมุมมองเพี้ยนจากกัน
    const dvBuildRowData = (v) => {
        const total = v.total_amount != null ? v.total_amount : (v.amount || 0);
        const hasVat = v.vat_type && v.vat_type !== 'NO_VAT' && (v.vat_amount || 0) > 0;
        return { total, hasVat };
    };

    const dvRowMarkup = (v) => {
        const d = dvBuildRowData(v);
        return `
        <tr class="hover:bg-divider transition-colors">
            <td class="px-6 py-4">
                <p class="font-mono font-semibold text-accent-ink">${escapeHtml(v.voucher_no || '-')}</p>
                <p class="text-xs text-ink/70 mt-0.5">${escapeHtml(dvDate(v.payment_date))}</p>
            </td>
            <td class="px-6 py-4 text-ink">${escapeHtml(v.payee_name || '-')}</td>
            <td class="px-6 py-4">${dvAccountCell(v.debit_account_id)}</td>
            <td class="px-6 py-4">${dvAccountCell(v.credit_account_id)}</td>
            <td class="px-6 py-4 text-right">
                <p class="text-ink font-mono font-semibold">${dvBaht(d.total)}</p>
                ${d.hasVat ? `<p class="text-xs text-ink/70 mt-0.5 font-mono">รวม VAT ${dvBaht(v.vat_amount)}</p>` : ''}
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-1">
                    <button type="button" class="btn-print-dv text-ink hover:text-accent-ink transition-colors p-2 cursor-pointer"
                        data-id="${escapeHtml(v._id)}" title="พิมพ์ใบสำคัญจ่าย"
                        aria-label="พิมพ์ใบสำคัญจ่าย ${escapeHtml(v.voucher_no || '')}">
                        <i class="fa-solid fa-print"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    };

    // การ์ด — โครง: หัว (เลขที่ / วันที่จ่าย · จำนวนเงิน) · ผู้รับเงิน · เดบิต/เครดิต 2 คอลัมน์ · footer (VAT + ปุ่มพิมพ์)
    const dvCardMarkup = (v) => {
        const d = dvBuildRowData(v);
        return `
        <div class="elev-card bg-surface-tile-3 rounded-md p-3.5">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="font-mono font-semibold text-accent-ink truncate">${escapeHtml(v.voucher_no || '-')}</p>
                    <p class="text-xs text-ink/70 mt-0.5">${escapeHtml(dvDate(v.payment_date))}</p>
                </div>
                <p class="text-ink font-mono font-semibold shrink-0">${dvBaht(d.total)}</p>
            </div>
            <p class="text-ink font-medium mt-2.5 truncate">${escapeHtml(v.payee_name || '-')}</p>

            <div class="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-hairline text-xs">
                <div class="min-w-0">
                    <p class="text-ink/60">บัญชีเดบิต</p>
                    <div class="mt-0.5">${dvAccountCell(v.debit_account_id)}</div>
                </div>
                <div class="min-w-0">
                    <p class="text-ink/60">บัญชีเครดิต</p>
                    <div class="mt-0.5">${dvAccountCell(v.credit_account_id)}</div>
                </div>
            </div>

            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                <span class="text-xs text-ink/70">${d.hasVat ? `รวม VAT ${dvBaht(v.vat_amount)}` : 'ไม่มี VAT'}</span>
                <button type="button" class="btn-print-dv text-ink hover:text-accent-ink transition-colors p-2 cursor-pointer"
                    data-id="${escapeHtml(v._id)}" title="พิมพ์ใบสำคัญจ่าย"
                    aria-label="พิมพ์ใบสำคัญจ่าย ${escapeHtml(v.voucher_no || '')}">
                    <i class="fa-solid fa-print"></i>
                </button>
            </div>
        </div>`;
    };

    // เรนเดอร์จากชุดที่โหลดมาแล้ว (ช่องค้นหากรองในหน่วยความจำ ไม่ยิง API ซ้ำ)
    const dvRenderTable = () => {
        const tbody = document.getElementById('dv-history-table-body');
        if (!tbody) return;

        const listWrap = document.getElementById('dv-view-list-wrap');
        const cardsWrap = document.getElementById('dv-view-cards');
        if (listWrap) listWrap.classList.toggle('hidden', dvViewMode !== 'list');
        if (cardsWrap) cardsWrap.classList.toggle('hidden', dvViewMode !== 'card');

        dvRenderChips();

        const q = _dvSearch.trim().toLowerCase();
        const rows = _dvCache.filter(v => {
            if (!q) return true;
            return [v.voucher_no, v.payee_name, v.remark,
            v.debit_account_id && v.debit_account_id.account_name,
            v.credit_account_id && v.credit_account_id.account_name]
                .filter(Boolean).join(' ').toLowerCase().includes(q);
        });

        const countEl = document.getElementById('dv-result-count');
        if (countEl) countEl.textContent = _dvCache.length ? `แสดง ${rows.length} จาก ${_dvCache.length} รายการ` : '';

        if (!rows.length) {
            const emptyMsg = _dvCache.length
                ? 'ไม่พบใบสำคัญจ่ายที่ตรงกับตัวกรอง'
                : 'ยังไม่มีใบสำคัญจ่ายในช่วงเวลานี้';
            tbody.innerHTML = dvStateRow(emptyMsg);
            if (cardsWrap) cardsWrap.innerHTML = dvStateCard(emptyMsg);
            return;
        }

        if (dvViewMode === 'card') {
            cardsWrap.innerHTML = rows.map(dvCardMarkup).join('');
            cardsWrap.querySelectorAll('.btn-print-dv').forEach(btn =>
                btn.addEventListener('click', () => printDisbursementVoucher(btn.dataset.id)));
        } else {
            // ลำดับเซลล์ต้องตรงกับหัวตารางเป๊ะ
            // (ของเดิมสลับกันอยู่: ผู้รับเงินไปโผล่ใต้หัว "บัญชีเดบิต" และยอดเงินไปอยู่ใต้ "ผู้รับเงิน")
            tbody.innerHTML = rows.map(dvRowMarkup).join('');
            tbody.querySelectorAll('.btn-print-dv').forEach(btn =>
                btn.addEventListener('click', () => printDisbursementVoucher(btn.dataset.id)));
        }
    };

    // สลับมุมมอง List/Card — ผูกที่ top-level ได้ (ไฟล์นี้เป็น js/page-*.js โหลดหลัง loadPageView
    // แทรก HTML ของ accounting-settings.html เข้า DOM แล้วเสมอ)
    const dvViewListBtn = document.getElementById('dv-view-list');
    const dvViewCardBtn = document.getElementById('dv-view-card');
    if (dvViewListBtn && dvViewCardBtn) {
        const syncDvViewButtons = (mode) => window.syncViewToggleButtons(dvViewListBtn, dvViewCardBtn, mode);
        const applyDvViewMode = (mode) => {
            dvViewMode = mode;
            localStorage.setItem('dv_view_mode', mode);
            syncDvViewButtons(mode);
            dvRenderTable();
        };
        dvViewListBtn.addEventListener('click', () => applyDvViewMode('list'));
        dvViewCardBtn.addEventListener('click', () => applyDvViewMode('card'));
        syncDvViewButtons(dvViewMode);
    }

    async function loadDisbursements() {
        const tbody = document.getElementById('dv-history-table-body');
        if (!tbody) return;

        // ผูก listener ครั้งเดียว (loadPageView แทรก HTML ครั้งเดียว)
        if (!_dvBound) {
            _dvBound = true;
            const searchEl = document.getElementById('dv-search');
            if (searchEl) {
                let t = null;
                searchEl.addEventListener('input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => { _dvSearch = searchEl.value; dvRenderTable(); }, 200);
                });
            }
            const refreshBtn = document.getElementById('btn-refresh-dv');
            if (refreshBtn) refreshBtn.addEventListener('click', () => loadDisbursements());
        }

        dvSkeleton();

        const start = document.getElementById('dv-filter-start')?.value || '';
        const end = document.getElementById('dv-filter-end')?.value || '';

        try {
            let url = `${API_BASE_URL}/acct/disbursements`;
            if (start || end) url += `?startDate=${start}&endDate=${end}`;

            const res = await authFetch(url);
            const data = await res.json();

            if (!data.success) {
                _dvCache = [];
                tbody.innerHTML = dvStateRow(data.message || 'ดึงข้อมูลใบสำคัญจ่ายไม่สำเร็จ', 'text-red-400');
                const c = document.getElementById('dv-result-count');
                if (c) c.textContent = '';
                dvRenderChips();
                return;
            }

            _dvCache = data.vouchers || [];
            dvRenderTable();
        } catch (error) {
            console.error('Error loadDisbursements:', error);
            _dvCache = [];
            tbody.innerHTML = dvStateRow('เชื่อมต่อเซิร์ฟเวอร์ผิดพลาด', 'text-red-400');
            const c = document.getElementById('dv-result-count');
            if (c) c.textContent = '';
            dvRenderChips();
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
                        <link rel="stylesheet" href="/vendor/fonts/fonts.css?v=2">
                        <style>
                            body { font-family: 'Sarabun', 'Prompt', 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif; padding: 30px; color: #333; line-height: 1.5; font-size: 14px; }
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
    window.initPnlConfigPage = initPnlConfigPage;
    window.renderPlPage = renderPlPage;
    window.openPlItemModal = openPlItemModal;
    window.closePlItemModal = closePlItemModal;
    window.savePlItem = savePlItem;
    window.initBalanceSheetConfig = initBalanceSheetConfig;
    window.renderBsPage = renderBsPage;
    window.openBsItemModal = openBsItemModal;
    window.closeBsItemModal = closeBsItemModal;
    window.onBsGroupChange = onBsGroupChange;
    window.saveBsItem = saveBsItem;
    window.initAccountTree = initAccountTree;
    window.openAcctGroupModal = openAcctGroupModal;
    window.closeAcctGroupModal = closeAcctGroupModal;
    window.saveAcctGroup = saveAcctGroup;
    window.openAcctAccountModal = openAcctAccountModal;
    window.closeAcctAccountModal = closeAcctAccountModal;
    window.saveAcctAccount = saveAcctAccount;
    window.initAccountDocLinks = initAccountDocLinks;
    window.openAcctDocModal = openAcctDocModal;
    window.closeAcctDocModal = closeAcctDocModal;
    window.saveAcctDoc = saveAcctDoc;
    window.openAcctDocLinkModal = openAcctDocLinkModal;
    window.closeAcctDocLinkModal = closeAcctDocLinkModal;
    window.saveAcctDocLink = saveAcctDocLink;

})();
