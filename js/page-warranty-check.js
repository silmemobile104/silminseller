// Warranty Check Logic (เช็คประกัน)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "เช็คประกัน" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.viewTransactionDetails, API_BASE_URL (global จาก script.js)
//
// เดินตามแบบแปลนหน้า #stock ใน DESIGN.md ข้อ 11.1 - 11.7:
// หัวหน้า -> การ์ดพาเนลใบเดียวที่มีแถบค้นหา + ชิปตัวกรอง + ตาราง
// เดิมหน้านี้เป็นการ์ดใบใหญ่ต่อหนึ่งผลลัพธ์ ซึ่งอ่านยากเมื่อค้นด้วยชื่อลูกค้าแล้วเจอหลายเครื่อง
(function () {
    const searchForm = document.getElementById('warranty-search-form');
    const searchInput = document.getElementById('warranty-search-input');
    const statusFilter = document.getElementById('warranty-filter-status');
    const tbody = document.getElementById('warranty-results-container');
    const chipsBox = document.getElementById('warranty-active-filters');
    const countEl = document.getElementById('warranty-result-count');

    // สลับมุมมอง List/Card — จำโหมดไว้ข้ามการเข้าหน้า (เดินตามรูปแบบเดียวกับหน้าการมัดจำ/ประวัติการขาย/สมาชิก)
    const viewListBtn = document.getElementById('warranty-view-list');
    const viewCardBtn = document.getElementById('warranty-view-card');
    const viewListWrap = document.getElementById('warranty-view-list-wrap');
    const viewCardsWrap = document.getElementById('warranty-view-cards');
    let _viewMode = localStorage.getItem('warranty_view_mode') === 'card' ? 'card' : 'list';

    const COLS = 8;
    // จำนวนวันก่อนหมดประกันที่ถือว่า "ใกล้หมด" — ใช้โทนสีระหว่างดำเนินการ (ข้อ 11.6)
    const SOON_DAYS = 30;

    let _all = [];        // ผลลัพธ์ทั้งหมดจากการค้นครั้งล่าสุด
    let _lastQuery = '';  // คำค้นที่ยิงไปจริง (ใช้ทำชิป ไม่ใช่ค่าที่กำลังพิมพ์อยู่)
    let _searched = false;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const dateTH = (d) => new Date(d).toLocaleDateString('th-TH',
        { day: 'numeric', month: 'short', year: 'numeric' });

    // ป้ายสถานะจุดสี — ชุดโทนเดียวกับ DESIGN.md ข้อ 11.6
    const TONE = {
        ok: { dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok' },
        soon: { dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' },
        expired: { dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger' }
    };
    const badge = (tone, label) => {
        const t = TONE[tone] || TONE.expired;
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">`
            + `<div class="w-2 h-2 rounded-full ${t.dot}"></div>`
            + `<span class="${t.text} font-medium text-xs">${esc(label)}</span></div>`;
    };

    // นับวันคงเหลือแบบเทียบ "ต้นวัน" ทั้งคู่ ไม่งั้นเครื่องที่หมดประกันวันนี้ตอนบ่าย
    // จะถูกนับเป็น -1 วันทั้งที่ยังไม่ควรถือว่าหมด
    const remainingDays = (expiry) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const exp = new Date(expiry); exp.setHours(0, 0, 0, 0);
        return Math.round((exp.getTime() - today.getTime()) / 86400000);
    };

    const statusOf = (item) => {
        const d = remainingDays(item.warranty_expiry);
        if (d < 0) return { key: 'expired', tone: 'expired', label: 'หมดประกันแล้ว', days: d };
        if (d <= SOON_DAYS) return { key: 'soon', tone: 'soon', label: 'ใกล้หมดประกัน', days: d };
        return { key: 'active', tone: 'ok', label: 'อยู่ในประกัน', days: d };
    };

    const stateRow = (msg, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${COLS}" class="px-6 py-8 text-center ${extraClass}">${esc(msg)}</td></tr>`;

    const stateCard = (msg, extraClass = 'text-ink/50 italic') =>
        `<div class="col-span-full py-12 text-center ${extraClass}">${esc(msg)}</div>`;

    // แถวโครงร่างระหว่างรอผลค้นหา — ต้องวางก่อน await เสมอ (ข้อ 11.7)
    const renderTableSkeleton = (rows = 4) => {
        if (!tbody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        tbody.innerHTML = Array.from({ length: rows }).map(() => `
            <tr>
                <td class="px-6 py-4"><div class="space-y-1.5">${bar('w-44')}${bar('w-32 h-3')}</div></td>
                <td class="px-6 py-4">${bar('w-28')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-16')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-8 ml-auto')}</td>
            </tr>`).join('');
    };

    // โครงร่างการ์ด — สัดส่วนบล็อกเดินตามโครงจริงของ cardHtml ด้านล่าง
    const renderCardSkeleton = (count = 6) => {
        if (!viewCardsWrap) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        viewCardsWrap.innerHTML = Array.from({ length: count }).map(() => `
            <div class="elev-card bg-surface-tile-3 rounded-md p-4">
                <div class="flex items-start justify-between gap-2">
                    ${bar('w-36')}
                    ${bar('w-16 h-5')}
                </div>
                ${bar('w-28 mt-4')}
                <div class="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-hairline">
                    <div class="space-y-2">${bar('w-20')}${bar('w-24')}</div>
                    <div class="space-y-2">${bar('w-16')}${bar('w-20')}</div>
                </div>
                <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                    ${bar('w-24')}
                    <div class="w-8 h-8 rounded-[0.375rem] bg-skeleton animate-pulse"></div>
                </div>
            </div>
        `).join('');
    };

    const renderSkeleton = (count = 4) => {
        if (_viewMode === 'card') renderCardSkeleton(count);
        else renderTableSkeleton(count);
    };

    const selectedText = (sel) => {
        if (!sel) return '';
        const opt = sel.options[sel.selectedIndex];
        return opt ? opt.textContent.trim() : '';
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5)
    const renderChips = () => {
        if (!chipsBox) return;
        chipsBox.innerHTML = '';

        const addChip = (label, onRemove) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40 text-ink text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${esc(label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.addEventListener('click', (e) => {
                // ลบได้เฉพาะตอนคลิกที่กากบาท ตัวชิปเองไม่ตอบสนอง (ข้อ 11.5)
                if (!e.target.closest('i.fa-xmark')) return;
                onRemove();
            });
            chipsBox.appendChild(chip);
        };

        let active = 0;

        if (_lastQuery) {
            active++;
            addChip(`ค้นหา: ${_lastQuery}`, () => {
                if (searchInput) searchInput.value = '';
                _lastQuery = '';
                _all = [];
                _searched = false;
                render();
            });
        }
        if (statusFilter && statusFilter.value) {
            active++;
            addChip(`สถานะ: ${selectedText(statusFilter)}`, () => {
                statusFilter.value = '';
                render();
            });
        }

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น (ข้อ 11.5)
        if (active > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium ring-1 ring-red-500/30 transition-colors';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (statusFilter) statusFilter.value = '';
                _lastQuery = '';
                _all = [];
                _searched = false;
                render();
            });
            chipsBox.appendChild(clearBtn);
        }
    };

    // ข้อมูลที่คำนวณร่วมกันระหว่างแถวตารางกับการ์ด — แยกออกมาครั้งเดียวเพื่อไม่ให้สองมุมมองเพี้ยนจากกัน
    const buildWarrantyRowData = (item) => {
        const st = statusOf(item);
        const memberName = item.member
            ? `${item.member.first_name || ''} ${item.member.last_name || ''}`.trim() || 'ลูกค้าทั่วไป'
            : 'ลูกค้าทั่วไป';
        const phone = item.member && item.member.phone ? item.member.phone : '';
        const branchName = item.branch && item.branch.name ? item.branch.name : '-';

        // นับวันเหลือ/เกิน เป็นข้อความประกอบใต้วันหมดอายุ
        const dayNote = st.days < 0
            ? `<span class="text-state-danger">เกินมา ${Math.abs(st.days)} วัน</span>`
            : st.days === 0
                ? `<span class="text-orange-400">หมดวันนี้</span>`
                : `<span class="${st.key === 'soon' ? 'text-orange-400' : 'text-ink/70'}">เหลืออีก ${st.days} วัน</span>`;

        return { st, memberName, phone, branchName, dayNote };
    };

    const rowHtml = (item) => {
        const d = buildWarrantyRowData(item);
        return `
        <tr class="hover:bg-divider transition-colors">
            <td class="px-6 py-4">
                <p class="font-medium text-ink">${esc(item.product_name)}</p>
                <p class="text-xs mt-0.5"><span class="font-mono font-semibold text-accent-ink">${esc(item.imei_sold)}</span></p>
            </td>
            <td class="px-6 py-4">
                <p class="text-ink">${esc(d.memberName)}</p>
                ${d.phone ? `<p class="text-xs text-ink/70 font-mono mt-0.5">${esc(d.phone)}</p>` : ''}
            </td>
            <td class="px-6 py-4 text-ink">${esc(d.branchName)}</td>
            <td class="px-6 py-4 text-ink">${dateTH(item.created_at)}</td>
            <td class="px-6 py-4 text-ink">${item.warranty_period ? esc(item.warranty_period) : '<span class="text-ink/50">-</span>'}</td>
            <td class="px-6 py-4">
                <p class="text-ink">${dateTH(item.warranty_expiry)}</p>
                <p class="text-xs mt-0.5">${d.dayNote}</p>
            </td>
            <td class="px-6 py-4">${badge(d.st.tone, d.st.label)}</td>
            <td class="px-6 py-4 text-right">
                <button type="button" class="warranty-receipt-link text-ink hover:text-accent-ink transition-colors p-2"
                    data-id="${esc(item.txn_id)}" title="ดูใบเสร็จ ${esc(item.receipt_number)}"
                    aria-label="ดูใบเสร็จ ${esc(item.receipt_number)}">
                    <i class="fa-solid fa-file-invoice"></i>
                </button>
            </td>
        </tr>`;
    };

    // การ์ด — โครง: หัว (สินค้า+IMEI / สถานะ) · ลูกค้า · สาขา+วันที่ซื้อ 2 คอลัมน์ · footer (ระยะประกัน+วันหมดอายุ + ปุ่มดูใบเสร็จ)
    const cardHtml = (item) => {
        const d = buildWarrantyRowData(item);
        return `
        <div class="elev-card pos-card bg-surface-tile-3 rounded-md p-4 transition-all hover:-translate-y-1 border-none cursor-pointer warranty-card"
             data-id="${esc(item.txn_id)}">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="font-medium text-ink truncate">${esc(item.product_name)}</p>
                    <p class="text-xs mt-0.5"><span class="font-mono font-semibold text-accent-ink">${esc(item.imei_sold)}</span></p>
                </div>
                <div class="shrink-0">${badge(d.st.tone, d.st.label)}</div>
            </div>

            <div class="mt-3 pt-3 border-t border-hairline">
                <p class="text-ink">${esc(d.memberName)}</p>
                ${d.phone ? `<p class="text-xs text-ink/70 font-mono mt-0.5">${esc(d.phone)}</p>` : ''}
            </div>

            <div class="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-hairline text-xs">
                <div class="min-w-0">
                    <p class="text-ink/60">สาขาที่ซื้อ</p>
                    <p class="text-ink mt-0.5 truncate">${esc(d.branchName)}</p>
                </div>
                <div class="min-w-0">
                    <p class="text-ink/60">วันที่ซื้อ</p>
                    <p class="text-ink mt-0.5 truncate">${dateTH(item.created_at)}</p>
                </div>
            </div>

            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                <div class="min-w-0">
                    <p class="text-ink">${dateTH(item.warranty_expiry)}</p>
                    <p class="text-xs mt-0.5">${d.dayNote}</p>
                </div>
                <button type="button" class="warranty-receipt-link text-ink hover:text-accent-ink transition-colors p-2 shrink-0"
                    data-id="${esc(item.txn_id)}" title="ดูใบเสร็จ ${esc(item.receipt_number)}"
                    aria-label="ดูใบเสร็จ ${esc(item.receipt_number)}">
                    <i class="fa-solid fa-file-invoice"></i>
                </button>
            </div>
        </div>`;
    };

    const bindReceiptLinks = (container) => {
        if (!container) return;
        container.querySelectorAll('.warranty-receipt-link').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const txnId = btn.dataset.id;
                if (txnId && typeof window.viewTransactionDetails === 'function') {
                    window.viewTransactionDetails(txnId);
                }
            });
        });
        // การ์ดทั้งใบคลิกได้เหมือนกัน (ทางลัดของเมาส์) — ปุ่มดูใบเสร็จยังเป็นทางเข้าที่คีย์บอร์ดใช้ได้จริง
        container.querySelectorAll('.warranty-card').forEach(card => {
            card.addEventListener('click', () => {
                const txnId = card.dataset.id;
                if (txnId && typeof window.viewTransactionDetails === 'function') {
                    window.viewTransactionDetails(txnId);
                }
            });
        });
    };

    // วาดตาราง/การ์ด + ชิป + ตัวนับ จากผลลัพธ์ที่มีอยู่ (กรองสถานะฝั่งหน้าเว็บ ไม่ต้องยิงซ้ำ)
    const render = () => {
        renderChips();
        if (!tbody) return;

        if (viewListWrap) viewListWrap.classList.toggle('hidden', _viewMode !== 'list');
        if (viewCardsWrap) viewCardsWrap.classList.toggle('hidden', _viewMode !== 'card');

        const want = statusFilter ? statusFilter.value : '';
        const rows = want ? _all.filter(i => statusOf(i).key === want) : _all;

        if (countEl) {
            countEl.textContent = _all.length
                ? `แสดง ${rows.length} จาก ${_all.length} รายการ`
                : '';
        }

        const setEmptyState = (msg) => {
            tbody.innerHTML = stateRow(msg);
            if (viewCardsWrap) viewCardsWrap.innerHTML = stateCard(msg);
        };

        if (!_searched) {
            setEmptyState('ระบุ IMEI ชื่อลูกค้า หรือเบอร์โทรศัพท์ แล้วกดค้นหา');
            return;
        }
        if (!_all.length) {
            setEmptyState('ไม่พบข้อมูลการรับประกันที่ตรงกับคำค้นหา');
            return;
        }
        if (!rows.length) {
            setEmptyState('ไม่มีรายการในสถานะนี้');
            return;
        }

        // เรียงให้เครื่องที่ใกล้หมด/หมดแล้วขึ้นก่อน เพราะเป็นเคสที่ต้องรีบจัดการ
        const order = { soon: 0, expired: 1, active: 2 };
        const sorted = [..._all]
            .filter(i => !want || statusOf(i).key === want)
            .sort((a, b) => {
                const sa = statusOf(a), sb = statusOf(b);
                if (order[sa.key] !== order[sb.key]) return order[sa.key] - order[sb.key];
                return sa.days - sb.days;
            });

        if (_viewMode === 'card') {
            viewCardsWrap.innerHTML = sorted.map(cardHtml).join('');
            tbody.innerHTML = '';
            bindReceiptLinks(viewCardsWrap);
        } else {
            tbody.innerHTML = sorted.map(rowHtml).join('');
            if (viewCardsWrap) viewCardsWrap.innerHTML = '';
            bindReceiptLinks(tbody);
        }
    };

    const checkWarranty = async (query) => {
        renderSkeleton();
        try {
            const response = await window.authFetch(
                `${API_BASE_URL}/warranty/check?q=${encodeURIComponent(query)}`);
            const result = await response.json();

            if (!result.success) {
                window.showToast('เกิดข้อผิดพลาดในการตรวจสอบประกัน: ' + result.message, 'error');
                _all = [];
                render();
                return;
            }
            _all = result.data || [];
            render();

        } catch (error) {
            console.error('Error checking warranty:', error);
            // เซสชั่นหมดอายุ script.js เด้งไปหน้าล็อกอินเองอยู่แล้ว ไม่ต้องขึ้น toast ซ้อน
            const expired = String(error && error.message || '').includes('เซสชั่นหมดอายุ');
            if (!expired) window.showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
            _all = [];
            const errMsg = expired ? 'เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง';
            if (tbody) tbody.innerHTML = stateRow(errMsg, 'text-red-400');
            if (viewCardsWrap) viewCardsWrap.innerHTML = stateCard(errMsg, 'text-red-400');
            renderChips();
            if (countEl) countEl.textContent = '';
        }
    };

    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = searchInput ? searchInput.value.trim() : '';
            if (!query) {
                _lastQuery = '';
                _all = [];
                _searched = false;
                render();
                return;
            }
            _lastQuery = query;
            _searched = true;
            checkWarranty(query);
        });
    }

    // เปลี่ยนสถานะ = กรองจากผลที่มีอยู่ ไม่ต้องยิง API ใหม่
    if (statusFilter) statusFilter.addEventListener('change', render);

    // ซิงก์คลาส active/idle ของปุ่มสลับมุมมองให้ตรงกับ _viewMode ปัจจุบัน (ไม่ render ข้อมูล)
    const syncViewButtons = (mode) => window.syncViewToggleButtons(viewListBtn, viewCardBtn, mode);

    // สลับมุมมอง List/Card — re-render จาก _all ทันที ไม่ยิง API ซ้ำ
    const applyViewMode = (mode) => {
        _viewMode = mode;
        localStorage.setItem('warranty_view_mode', mode);
        syncViewButtons(mode);
        render();
    };

    if (viewListBtn) viewListBtn.addEventListener('click', () => applyViewMode('list'));
    if (viewCardBtn) viewCardBtn.addEventListener('click', () => applyViewMode('card'));
    syncViewButtons(_viewMode);

    // สถานะเริ่มต้นก่อนค้นหาครั้งแรก
    render();
})();
