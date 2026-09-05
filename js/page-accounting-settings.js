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
