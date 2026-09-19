// Order Verification (ตรวจสอบออเดอร์ — ฝ่ายบัญชี)
// โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ตรวจสอบออเดอร์" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.ensureMasterDataLoaded,
// window.masterDataCache, window.productColorDot, API_BASE_URL (global จาก script.js)
//
// ⚠️ ตัวเลขทุกตัวในโมดัลรายละเอียดคำนวณมาจาก /api/order-verifications ฝั่งเซิร์ฟเวอร์ที่เดียว
//    หน้านี้มีหน้าที่แค่จัดรูปแบบการแสดงผล ห้ามคำนวณสูตรเงินซ้ำที่ฝั่ง frontend
//    ไม่งั้นสองที่จะเพี้ยนจากกันเงียบๆ เวลามีคนแก้สูตรข้างใดข้างหนึ่ง
(function () {
    const OV_COLS = 8;

    const ovSearch = document.getElementById('order-verification-search');
    const ovStatus = document.getElementById('order-verification-status');
    const ovBranch = document.getElementById('order-verification-branch');
    const ovTableBody = document.getElementById('order-verification-table-body');
    const ovActiveFilters = document.getElementById('order-verification-active-filters');
    const ovResultCount = document.getElementById('order-verification-result-count');

    const ovFilterPanel = document.getElementById('order-verification-filter-panel');
    const ovFilterPanelContent = document.getElementById('order-verification-filter-panel-content');
    const btnOvFilter = document.getElementById('btn-order-verification-filter');
    const btnOvFilterText = document.getElementById('btn-order-verification-filter-text');
    const btnOvFilterClose = document.getElementById('btn-order-verification-filter-close');

    const ovStartDate = document.getElementById('order-verification-start-date');
    const ovEndDate = document.getElementById('order-verification-end-date');
    const ovEmployee = document.getElementById('order-verification-employee');
    const ovPaymentType = document.getElementById('order-verification-payment-type');
    const ovProductType = document.getElementById('order-verification-product-type');
    const ovProductTypeContainer = document.getElementById('order-verification-product-type-container');

    const ovStatusMenu = document.getElementById('order-verification-status-menu');

    const ovDetailModal = document.getElementById('modal-order-verification-detail');
    const btnOvDetailClose = document.getElementById('btn-order-verification-detail-close');
    const btnOvDetailSave = document.getElementById('btn-order-detail-save');
    const btnOvDetailCancel = document.getElementById('btn-order-detail-cancel');
    const ovDetailNote = document.getElementById('order-detail-note');
    const ovDetailPaymentStatus = document.getElementById('order-detail-payment-status');
    const ovDetailVerifyStatus = document.getElementById('order-detail-verify-status');
    const ovDetailDevicePrice = document.getElementById('order-detail-device-price');
    const ovDetailDownInput = document.getElementById('order-detail-down-input');

    // แท็บรายการมัดจำ — อ่านอย่างเดียว ใช้ /deposits ตัวเดียวกับหน้า "การมัดจำ"
    const ovTabSelect = document.getElementById('ov-tab-select');
    const ovPanelOrders = document.getElementById('ov-panel-orders');
    const ovPanelDeposits = document.getElementById('ov-panel-deposits');
    const ovControlsOrders = document.getElementById('ov-controls-orders');
    const ovControlsDeposits = document.getElementById('ov-controls-deposits');
    const ovDepositSearch = document.getElementById('ov-deposit-search');
    const ovDepositStatus = document.getElementById('ov-deposit-status');
    const ovDepositBranch = document.getElementById('ov-deposit-branch');
    const ovDepositTableBody = document.getElementById('ov-deposit-table-body');
    const ovDepositResultCount = document.getElementById('ov-deposit-result-count');
    const OV_DEPOSIT_COLS = 7;

    // แท็บประวัติค่าใช้จ่าย — ใช้ /expenses ซึ่งมีเฉพาะหน้านี้
    const ovPanelExpenses = document.getElementById('ov-panel-expenses');
    const ovControlsExpenses = document.getElementById('ov-controls-expenses');
    const ovExpenseSearch = document.getElementById('ov-expense-search');
    const ovExpenseCategory = document.getElementById('ov-expense-category');
    const ovExpenseBranch = document.getElementById('ov-expense-branch');
    const ovExpenseTableBody = document.getElementById('ov-expense-table-body');
    const ovExpenseResultCount = document.getElementById('ov-expense-result-count');
    const ovExpenseTotal = document.getElementById('ov-expense-total');
    const OV_EXPENSE_COLS = 7;

    const btnAddExpense = document.getElementById('btn-add-expense');
    const ovExpenseModal = document.getElementById('modal-expense');
    const ovExpenseForm = document.getElementById('form-expense');
    const ovExpenseDate = document.getElementById('expense-date');
    const ovExpenseDescription = document.getElementById('expense-description');
    const ovExpenseCategoryInput = document.getElementById('expense-category');
    const ovExpenseFinanceWrap = document.getElementById('expense-finance-wrap');
    const ovExpenseFinanceCompany = document.getElementById('expense-finance-company');
    const ovExpenseAmount = document.getElementById('expense-amount');
    const btnExpenseClose = document.getElementById('btn-expense-close');
    const btnExpenseCancel = document.getElementById('btn-expense-cancel');
    const btnExpenseSave = document.getElementById('btn-expense-save');

    let ovCache = [];
    // เรนเดอร์ทีละ 10 แถว แล้วโหลดเพิ่มเองตอนเลื่อนถึงท้ายตาราง (infinite scroll)
    // API ส่งมาทั้งชุดอยู่แล้ว (กรอง product_type / payment_status ต้องทำหลังประกอบแถว จึง paginate ที่ฝั่ง
    // เซิร์ฟเวอร์ไม่ได้) การหั่นจึงทำที่ฝั่งหน้าเว็บ ซึ่งตัดเวลาเรนเดอร์ DOM ตอนเปิดหน้าได้เต็มๆ
    const OV_PAGE_SIZE = 10;
    let ovRenderedCount = 0;
    let ovOrdersObserver = null;
    let ovCurrentOrder = null;   // บิลที่เปิดอยู่ในโมดัลรายละเอียด
    let ovMenuTargetId = null;   // บิลที่กำลังเปิดเมนูเลือกสถานะอยู่
    let ovActiveTab = 'orders';  // แท็บเริ่มต้นคือรายการตรวจสอบออเดอร์เสมอ ไม่จำค่าข้ามการเข้าหน้า
    let ovDepositsLoaded = false;
    let ovDepositCache = [];
    let ovExpensesLoaded = false;
    let ovExpenseCache = [];

    // สลับมุมมอง List/Card — ใช้ค่าเดียวกันทั้งสองแท็บ และจำไว้ข้ามการเข้าหน้า (เหมือนหน้าอื่นในระบบ)
    const ovViewListBtn = document.getElementById('ov-view-list');
    const ovViewCardBtn = document.getElementById('ov-view-card');
    const ovOrdersListWrap = document.getElementById('ov-orders-list-wrap');
    const ovOrdersCardsWrap = document.getElementById('ov-orders-cards');
    const ovOrdersSentinel = document.getElementById('ov-orders-sentinel');
    const ovDepositViewListBtn = document.getElementById('ov-deposit-view-list');
    const ovDepositViewCardBtn = document.getElementById('ov-deposit-view-card');
    const ovDepositsListWrap = document.getElementById('ov-deposits-list-wrap');
    const ovDepositsCardsWrap = document.getElementById('ov-deposits-cards');
    const ovExpenseViewListBtn = document.getElementById('ov-expense-view-list');
    const ovExpenseViewCardBtn = document.getElementById('ov-expense-view-card');
    const ovExpensesListWrap = document.getElementById('ov-expenses-list-wrap');
    const ovExpensesCardsWrap = document.getElementById('ov-expenses-cards');
    let ovViewMode = localStorage.getItem('order_verification_view_mode') === 'card' ? 'card' : 'list';

    const ovEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const ovBaht = (n) => `฿${(Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const ovBahtShort = (n) => `฿${Math.round(Number(n) || 0).toLocaleString('th-TH')}`;
    // เรตเฉลี่ยของบิลคละประเภทมีทศนิยมยาว แต่เรตที่ตั้งไว้ตรงๆ ไม่ควรกลายเป็น "10.00%"
    const ovRate = (n) => {
        const v = Number(n) || 0;
        return Number.isInteger(v) ? String(v) : v.toFixed(2);
    };

    // วันที่แบบไทย (พ.ศ.) ให้ตรงกับที่ใช้ทั้งระบบ
    const ovDateParts = (value) => {
        if (!value) return { time: '-', date: '-' };
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { time: '-', date: '-' };
        const pad = (n) => String(n).padStart(2, '0');
        return {
            time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
            date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`
        };
    };

    const ovDateTimeText = (value) => {
        const p = ovDateParts(value);
        return p.date === '-' ? '-' : `${p.date} ${p.time}`;
    };

    // ==========================================
    // ชิ้นส่วน UI ที่ใช้ซ้ำ — เดินตามแบบแปลนหน้า #stock ใน DESIGN.md ข้อ 11.5 - 11.7
    // ==========================================

    const ovStateRow = (message, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${OV_COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ (ข้อ 11.7)
    const renderOvSkeleton = (rowCount = 6) => {
        if (!ovTableBody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `
                <tr>
                    <td class="px-6 py-4">${bar('w-32')}</td>
                    <td class="px-6 py-4"><div class="space-y-2">${bar('w-48')}${bar('w-36')}</div></td>
                    <td class="px-6 py-4">${bar('w-24')}</td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4">${bar('w-24 h-6')}</td>
                    <td class="px-6 py-4">${bar('w-24 h-6')}</td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4"><div class="flex items-center justify-end gap-1">${bar('w-7 h-7')}${bar('w-7 h-7')}</div></td>
                </tr>
            `;
        }
        ovTableBody.innerHTML = html;
    };

    // ป้ายสถานะการชำระเงิน — กดได้ จึงมีเส้นขอบ + ลูกศรบอกว่าเปลี่ยนค่าได้ (บิลที่ยกเลิกแล้วกดไม่ได้)
    const ovStatusPill = (row) => {
        const paid = row.payment_status === 'ชำระแล้ว';
        const tone = paid
            ? 'bg-state-ok-tint/[0.14] text-state-ok ring-state-ok/40'
            : 'bg-state-danger/[0.14] text-state-danger-soft ring-state-danger/40';
        const cancelled = row.status === 'ยกเลิกแล้ว';

        if (cancelled) {
            return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-chip/40 ring-1 ring-line-strong">
                        <span class="text-body-muted font-medium text-xs">ยกเลิกแล้ว</span>
                    </div>`;
        }

        return `
            <button type="button" data-status-toggle="${row._id}"
                aria-label="เปลี่ยนสถานะการชำระเงินของบิล ${ovEsc(row.receipt_number)} ปัจจุบันคือ ${row.payment_status}"
                class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ring-1 ${tone} font-medium text-xs transition-colors cursor-pointer hover:brightness-110">
                <span>${row.payment_status}</span>
                <i class="fa-solid fa-chevron-down text-[9px] opacity-80"></i>
            </button>
        `;
    };

    // ป้ายสถานะดำเนินการ — ป้ายจุด + พื้น tint 12% ตามตารางสถานะใน DESIGN.md ข้อ 11.6
    // (เปลี่ยนค่าได้จากโมดัลรายละเอียดเท่านั้น ในตารางจึงเป็นป้ายอ่านอย่างเดียว)
    const ovVerifyBadge = (row) => {
        const done = row.verify_status === 'สำเร็จ';
        const dot = done ? 'bg-state-ok' : 'bg-state-pending';
        const bg = done ? 'bg-state-ok-tint/[0.12]' : 'bg-state-pending/[0.12]';
        const text = done ? 'text-state-ok' : 'text-state-pending';
        return `
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${bg}">
                <div class="w-2 h-2 rounded-full ${dot}"></div>
                <span class="${text} font-medium text-xs">${row.verify_status || 'รอตรวจสอบ'}</span>
            </div>
        `;
    };

    const ovSaleTypeText = (row) => {
        if (!row.is_financing) return 'ซื้อสด';
        return row.finance_company_name ? `ผ่อนกับ ${row.finance_company_name}` : 'ผ่อน';
    };

    const ovRowMarkup = (row) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-divider transition-colors';

        const firstItem = (row.items || []).find(it => !it.is_gift) || (row.items || [])[0] || null;
        const extraCount = Math.max(0, (row.items || []).length - 1);
        const dot = firstItem && window.productColorDot
            ? window.productColorDot(firstItem.color_name)
            : '';
        const imeiText = firstItem && firstItem.imei_sold
            ? `IMEI : ${ovEsc(firstItem.imei_sold)}`
            : (firstItem && firstItem.product_code ? `รหัส : ${ovEsc(firstItem.product_code)}` : '-');
        const t = ovDateParts(row.created_at);
        // ราคาเครื่อง = ราคาเดิมของเครื่องในบิล (ตัวเดียวกับที่ใช้คิดทุนเช่าซื้อ) บิลที่ขายแต่อุปกรณ์เสริมจึงเป็น 0
        const devicePrice = (row.finance && row.finance.full_price) || 0;

        tr.innerHTML = `
            <td class="px-6 py-4 text-ink">
                <span class="font-mono">${t.date}</span>
                <span class="font-mono text-ink/70 ml-2">${t.time}</span>
            </td>
            <td class="px-6 py-4">
                <p class="font-medium text-ink flex items-center gap-2">
                    ${dot}<span>${ovEsc(firstItem ? firstItem.product_name : '-')}</span>
                    ${extraCount > 0 ? `<span class="text-xs text-ink/70">และอีก ${extraCount} รายการ</span>` : ''}
                </p>
                <p class="text-xs text-ink/70 mt-0.5">${imeiText}</p>
            </td>
            <td class="px-6 py-4 text-ink">${ovEsc(ovSaleTypeText(row))}</td>
            <td class="px-6 py-4 text-ink font-mono">${devicePrice > 0 ? ovBahtShort(devicePrice) : '<span class="text-ink/50">-</span>'}</td>
            <td class="px-6 py-4">${ovStatusPill(row)}</td>
            <td class="px-6 py-4">${ovVerifyBadge(row)}</td>
            <td class="px-6 py-4 text-ink">${ovEsc(row.branch_name || '-')}</td>
            <td class="px-6 py-4">
                <div class="flex items-center justify-end gap-1">
                    <button type="button" data-print="${row._id}" title="พิมพ์ใบเสร็จ"
                        aria-label="พิมพ์ใบเสร็จบิล ${ovEsc(row.receipt_number)}"
                        class="text-ink hover:text-amber-400 transition-colors p-2">
                        <i class="fa-solid fa-print"></i>
                    </button>
                    <button type="button" data-detail="${row._id}" title="ดูรายละเอียด"
                        aria-label="ดูรายละเอียดบิล ${ovEsc(row.receipt_number)}"
                        class="text-ink hover:text-indigo-400 transition-colors p-2">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </td>
        `;
        return tr;
    };

    // การ์ดออเดอร์ — ข้อมูลชุดเดียวกับแถวตาราง เรียงใหม่ให้อ่านบนจอแคบได้
    const ovOrderCardMarkup = (row) => {
        const card = document.createElement('div');
        card.className = 'elev-card bg-surface-tile-3 rounded-md p-4 transition-all hover:-translate-y-1';

        const firstItem = (row.items || []).find(it => !it.is_gift) || (row.items || [])[0] || null;
        const extraCount = Math.max(0, (row.items || []).length - 1);
        const dot = firstItem && window.productColorDot ? window.productColorDot(firstItem.color_name) : '';
        const imeiText = firstItem && firstItem.imei_sold
            ? `IMEI : ${ovEsc(firstItem.imei_sold)}`
            : (firstItem && firstItem.product_code ? `รหัส : ${ovEsc(firstItem.product_code)}` : '');
        const t = ovDateParts(row.created_at);
        const devicePrice = (row.finance && row.finance.full_price) || 0;

        card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="font-mono font-semibold text-accent-ink truncate">${ovEsc(row.receipt_number)}</p>
                    <p class="text-xs text-ink/70 mt-0.5 font-mono">${t.date} ${t.time}</p>
                </div>
                <div class="shrink-0">${ovVerifyBadge(row)}</div>
            </div>

            <div class="mt-3 pt-3 border-t border-hairline">
                <p class="font-medium text-ink flex items-center gap-2 min-w-0">
                    ${dot}<span class="truncate">${ovEsc(firstItem ? firstItem.product_name : '-')}</span>
                </p>
                ${imeiText ? `<p class="text-xs text-ink/70 mt-0.5">${imeiText}</p>` : ''}
                ${extraCount > 0 ? `<p class="text-xs text-ink/70 mt-0.5">และอีก ${extraCount} รายการ</p>` : ''}
            </div>

            <div class="mt-3">
                <p class="text-[10px] text-ink/60 uppercase tracking-wide">รูปแบบการขาย / สาขา</p>
                <p class="text-sm text-ink mt-1 truncate">${ovEsc(ovSaleTypeText(row))}</p>
                <p class="text-xs text-ink/70">${ovEsc(row.branch_name || '-')}</p>
            </div>

            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline gap-2">
                ${ovStatusPill(row)}
                <span class="text-base font-mono font-bold text-ink">${devicePrice > 0 ? ovBahtShort(devicePrice) : '-'}</span>
            </div>

            <div class="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-hairline">
                <button type="button" data-print="${row._id}" title="พิมพ์ใบเสร็จ"
                    aria-label="พิมพ์ใบเสร็จบิล ${ovEsc(row.receipt_number)}"
                    class="text-ink hover:text-amber-400 transition-colors p-2">
                    <i class="fa-solid fa-print"></i>
                </button>
                <button type="button" data-detail="${row._id}" title="ดูรายละเอียด"
                    aria-label="ดูรายละเอียดบิล ${ovEsc(row.receipt_number)}"
                    class="text-ink hover:text-indigo-400 transition-colors p-2">
                    <i class="fa-solid fa-eye"></i>
                </button>
            </div>
        `;
        return card;
    };

    // โครงร่างการ์ดระหว่างรอข้อมูล — สัดส่วนบล็อกเดินตามการ์ดจริงด้านบน
    const renderOvCardSkeleton = (cardCount = 8, wrap = ovOrdersCardsWrap) => {
        if (!wrap) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        let html = '';
        for (let i = 0; i < cardCount; i++) {
            html += `
                <div class="elev-card bg-surface-tile-3 rounded-md p-4">
                    <div class="flex items-start justify-between gap-2">
                        <div class="space-y-2">${bar('w-28 h-4')}${bar('w-24')}</div>
                        ${bar('w-20 h-6')}
                    </div>
                    <div class="mt-3 pt-3 border-t border-hairline space-y-2">${bar('w-36')}${bar('w-28')}</div>
                    <div class="mt-3 space-y-2">${bar('w-24')}${bar('w-20')}</div>
                    <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                        ${bar('w-20 h-6')}${bar('w-16 h-5')}
                    </div>
                </div>
            `;
        }
        wrap.innerHTML = html;
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const renderOvChips = () => {
        if (!ovActiveFilters) return;
        ovActiveFilters.innerHTML = '';

        const addChip = (label, onRemove) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40 text-ink text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${ovEsc(label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.setAttribute('aria-label', `ลบตัวกรอง ${label}`);
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return;
                onRemove();
            });
            ovActiveFilters.appendChild(chip);
        };

        let active = 0;

        const term = (ovSearch && ovSearch.value || '').trim();
        if (term) {
            active++;
            addChip(`ค้นหา: ${term}`, () => { ovSearch.value = ''; loadOrderVerifications(); });
        }
        if (ovStatus && ovStatus.value) {
            active++;
            addChip(`สถานะ: ${ovStatus.value}`, () => { ovStatus.value = ''; loadOrderVerifications(); });
        }
        if (ovBranch && ovBranch.value) {
            active++;
            const label = ovBranch.options[ovBranch.selectedIndex] ? ovBranch.options[ovBranch.selectedIndex].text : '';
            addChip(`สาขา: ${label}`, () => { ovBranch.value = ''; loadOrderVerifications(); });
        }
        if (ovPaymentType && ovPaymentType.value) {
            active++;
            addChip(`รูปแบบการขาย: ${ovPaymentType.value}`, () => { ovPaymentType.value = ''; loadOrderVerifications(); });
        }
        if (ovProductType && ovProductType.value) {
            active++;
            addChip(`ประเภทสินค้า: ${ovProductType.value}`, () => {
                ovProductType.value = '';
                syncProductTypePills();
                loadOrderVerifications();
            });
        }
        if (ovStartDate && ovStartDate.value) {
            active++;
            addChip(`ตั้งแต่: ${ovStartDate.value}`, () => { ovStartDate.value = ''; loadOrderVerifications(); });
        }
        if (ovEndDate && ovEndDate.value) {
            active++;
            addChip(`ถึง: ${ovEndDate.value}`, () => { ovEndDate.value = ''; loadOrderVerifications(); });
        }
        if (ovEmployee && ovEmployee.value) {
            active++;
            const label = ovEmployee.options[ovEmployee.selectedIndex] ? ovEmployee.options[ovEmployee.selectedIndex].text : '';
            addChip(`พนักงานขาย: ${label}`, () => { ovEmployee.value = ''; loadOrderVerifications(); });
        }

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น (ข้อ 11.5)
        if (active > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium border border-red-500/30 transition-colors';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', resetAllOvFilters);
            ovActiveFilters.appendChild(clearBtn);
        }

        // ป้ายบนปุ่มเปิด drawer ต้องบอกจำนวนตัวกรองที่ใช้อยู่ (ข้อ 11.4)
        const drawerCount = [
            ovPaymentType && ovPaymentType.value,
            ovProductType && ovProductType.value,
            ovStartDate && ovStartDate.value,
            ovEndDate && ovEndDate.value,
            ovEmployee && ovEmployee.value
        ].filter(Boolean).length;
        if (btnOvFilterText) {
            btnOvFilterText.textContent = drawerCount > 0 ? `กรองเพิ่มเติม (${drawerCount})` : 'กรองเพิ่มเติม';
        }
    };

    const resetAllOvFilters = () => {
        if (ovSearch) ovSearch.value = '';
        if (ovStatus) ovStatus.value = '';
        if (ovBranch) ovBranch.value = '';
        if (ovPaymentType) ovPaymentType.value = '';
        if (ovProductType) ovProductType.value = '';
        if (ovStartDate) ovStartDate.value = '';
        if (ovEndDate) ovEndDate.value = '';
        if (ovEmployee) ovEmployee.value = '';
        syncProductTypePills();
        loadOrderVerifications();
    };

    // ==========================================
    // โหลดข้อมูล
    // ==========================================
    // preserveRendered: คงจำนวนแถวที่เรนเดอร์อยู่ไว้ (ใช้ตอนโหลดซ้ำหลังบันทึกสถานะ)
    //                   ถ้าไม่ส่งมา = เริ่มนับใหม่ที่ 10 แถว เช่นตอนเปลี่ยนตัวกรอง
    async function loadOrderVerifications({ preserveRendered = false } = {}) {
        if (!ovTableBody) return;
        const keepCount = preserveRendered ? ovRenderedCount : 0;

        renderOvChips();
        if (ovResultCount) ovResultCount.textContent = '';
        // ซ่อนแถบโหลดเพิ่มระหว่างดึงชุดใหม่ ไม่งั้นจะค้างอยู่ใต้ skeleton
        if (ovOrdersSentinel) ovOrdersSentinel.classList.add('hidden');
        if (ovViewMode === 'card') renderOvCardSkeleton();
        else renderOvSkeleton();

        try {
            const params = new URLSearchParams();
            const append = (key, el) => {
                const v = el && el.value ? el.value.trim() : '';
                if (v) params.append(key, v);
            };
            append('search', ovSearch);
            append('payment_status', ovStatus);
            append('branch_id', ovBranch);
            append('payment_type', ovPaymentType);
            append('product_type', ovProductType);
            append('startDate', ovStartDate);
            append('endDate', ovEndDate);
            append('employee_id', ovEmployee);

            const response = await authFetch(`${API_BASE_URL}/order-verifications?${params.toString()}`);
            const result = await response.json();

            if (!result.success) {
                ovCache = [];
                ovRenderedCount = 0;
                syncOvSentinel();
                ovTableBody.innerHTML = ovStateRow(ovEsc(result.message || 'ไม่สามารถโหลดข้อมูลได้'), 'text-red-400');
                return;
            }

            ovCache = Array.isArray(result.data) ? result.data : [];
            renderOvResults(keepCount);
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error loading orders:', err);
            ovCache = [];
            ovRenderedCount = 0;
            syncOvSentinel();
            ovTableBody.innerHTML = ovStateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
        }
    }
    window.loadOrderVerifications = loadOrderVerifications;

    // ซ่อน/แสดงแถบ "กำลังโหลดเพิ่ม" ตามว่ายังมีรายการเหลือให้โหลดอีกไหม
    const syncOvSentinel = () => {
        if (!ovOrdersSentinel) return;
        ovOrdersSentinel.classList.toggle('hidden', ovRenderedCount >= ovCache.length);
    };

    // ต่อแถวชุดถัดไป (ครั้งละ OV_PAGE_SIZE) เข้าไปท้ายตาราง/กริดการ์ดที่แสดงอยู่
    const appendOvChunk = (count = OV_PAGE_SIZE) => {
        const next = ovCache.slice(ovRenderedCount, ovRenderedCount + count);
        if (next.length === 0) {
            syncOvSentinel();
            return;
        }

        const frag = document.createDocumentFragment();
        if (ovViewMode === 'card') {
            next.forEach(row => frag.appendChild(ovOrderCardMarkup(row)));
            if (ovOrdersCardsWrap) ovOrdersCardsWrap.appendChild(frag);
        } else {
            next.forEach(row => frag.appendChild(ovRowMarkup(row)));
            ovTableBody.appendChild(frag);
        }

        ovRenderedCount += next.length;
        if (ovResultCount) ovResultCount.textContent = `แสดง ${ovRenderedCount} จาก ${ovCache.length} รายการ`;
        syncOvSentinel();

        // ถ้าแถวชุดนี้ยังไม่ยาวพอจะดันจุดสังเกตพ้นจอ ต้องโหลดต่อเอง
        // IntersectionObserver ยิงเฉพาะตอนสถานะ "เปลี่ยน" ไม่ยิงซ้ำถ้าจุดสังเกตยังค้างอยู่ในจอ
        if (ovRenderedCount < ovCache.length && ovOrdersSentinel) {
            setTimeout(() => {
                if (ovRenderedCount >= ovCache.length) return;
                if (ovOrdersSentinel.classList.contains('hidden')) return;
                const box = ovOrdersSentinel.getBoundingClientRect();
                // ⚠️ ต้องเช็กว่าถูกวางผังแล้วจริง ก่อนเอา top ไปเทียบ
                //    ตอน switchView เพิ่งฉีด fragment เข้า DOM อิลิเมนต์ยังสูง 0 และ top เป็น 0
                //    ถ้าไม่กันไว้ เงื่อนไขจะผ่านทุกรอบ กลายเป็นเรนเดอร์รวดเดียวครบทุกแถว
                //    (กรณีนั้นปล่อยให้ IntersectionObserver มาโหลดต่อตอนหน้าแสดงผลจริงแทน)
                if (box.height <= 0) return;
                if (box.top <= window.innerHeight) appendOvChunk();
            }, 0);
        }
    };

    // เฝ้าจุดสังเกตท้ายรายการ — เลื่อนมาใกล้เมื่อไหร่ก็โหลดเพิ่มอีกชุด
    // ผูกครั้งเดียวพอ เพราะอิลิเมนต์ไม่เคยถูกสร้างใหม่ (แค่ซ่อน/แสดง)
    const ensureOvOrdersObserver = () => {
        if (ovOrdersObserver || !ovOrdersSentinel || typeof IntersectionObserver === 'undefined') return;
        ovOrdersObserver = new IntersectionObserver((entries) => {
            if (!entries.some(e => e.isIntersecting)) return;
            if (ovRenderedCount >= ovCache.length) return;
            appendOvChunk();
            // rootMargin ต้องเป็น 0 — ถ้าเผื่อระยะไว้ ชุดที่สองจะถูกโหลดตั้งแต่เปิดหน้า
            // กลายเป็นแสดง 20 แถวแรกแทนที่จะเป็น 10 (ข้อมูลอยู่ในหน่วยความจำแล้ว ต่อแถวทันที ไม่มีรอยสะดุดอยู่แล้ว)
        }, { rootMargin: '0px' });
        ovOrdersObserver.observe(ovOrdersSentinel);
    };

    // minCount: จำนวนแถวขั้นต่ำที่ต้องเรนเดอร์ใหม่ ใช้ตอนโหลดข้อมูลซ้ำหลังกดบันทึกสถานะ
    // เพื่อไม่ให้ฝ่ายบัญชีที่เลื่อนลงไปไกลแล้วถูกดีดกลับมาเหลือ 10 แถวแรก
    const renderOvResults = (minCount = OV_PAGE_SIZE) => {
        if (!ovTableBody) return;

        if (ovOrdersListWrap) ovOrdersListWrap.classList.toggle('hidden', ovViewMode !== 'list');
        if (ovOrdersCardsWrap) ovOrdersCardsWrap.classList.toggle('hidden', ovViewMode !== 'card');

        ovRenderedCount = 0;

        if (ovCache.length === 0) {
            ovTableBody.innerHTML = ovStateRow('ไม่พบออเดอร์ตามตัวเลือก');
            if (ovOrdersCardsWrap) ovOrdersCardsWrap.innerHTML = '<div class="col-span-full py-12 text-center text-ink/50 italic">ไม่พบออเดอร์ตามตัวเลือก</div>';
            if (ovResultCount) ovResultCount.textContent = '';
            syncOvSentinel();
            return;
        }

        ovTableBody.innerHTML = '';
        if (ovOrdersCardsWrap) ovOrdersCardsWrap.innerHTML = '';

        ensureOvOrdersObserver();
        appendOvChunk(Math.max(OV_PAGE_SIZE, minCount));
    };

    // ==========================================
    // แท็บรายการมัดจำ
    // ==========================================
    const ovDepositStateRow = (message, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${OV_DEPOSIT_COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    const renderDepositSkeleton = (rowCount = 6) => {
        if (!ovDepositTableBody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `
                <tr>
                    <td class="px-6 py-4">${bar('w-32')}</td>
                    <td class="px-6 py-4">${bar('w-28')}</td>
                    <td class="px-6 py-4"><div class="space-y-2">${bar('w-40')}${bar('w-32')}</div></td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4">${bar('w-24 h-6')}</td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                </tr>
            `;
        }
        ovDepositTableBody.innerHTML = html;
    };

    // ป้ายสถานะมัดจำ — ชุดสีเดียวกับตารางสถานะใน DESIGN.md ข้อ 11.6
    const ovDepositBadge = (status) => {
        const map = {
            'สำเร็จ': ['bg-state-ok', 'bg-state-ok-tint/[0.12]', 'text-state-ok'],
            'ยกเลิก': ['bg-state-danger', 'bg-state-danger/[0.12]', 'text-state-danger-soft'],
            'รอดำเนินการ': ['bg-state-pending', 'bg-state-pending/[0.12]', 'text-state-pending']
        };
        const [dot, bg, text] = map[status] || map['รอดำเนินการ'];
        return `
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${bg}">
                <div class="w-2 h-2 rounded-full ${dot}"></div>
                <span class="${text} font-medium text-xs">${ovEsc(status || 'รอดำเนินการ')}</span>
            </div>
        `;
    };

    const ovDepositRowMarkup = (dep) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-divider transition-colors';
        const t = ovDateParts(dep.createdAt || dep.created_at);
        const branchName = dep.branch_id && dep.branch_id.name ? dep.branch_id.name : '-';

        tr.innerHTML = `
            <td class="px-6 py-4 text-ink">
                <span class="font-mono">${t.date}</span>
                <span class="font-mono text-ink/70 ml-2">${t.time}</span>
            </td>
            <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${ovEsc(dep.deposit_number)}</span></td>
            <td class="px-6 py-4">
                <p class="font-medium text-ink">${ovEsc(dep.customer_name)} <span class="text-xs text-ink/70 font-mono ml-1">${ovEsc(dep.customer_phone || '')}</span></p>
                <p class="text-xs text-ink/70 mt-0.5">${ovEsc(dep.product_name || '-')}</p>
            </td>
            <td class="px-6 py-4 text-ink font-mono">${ovBahtShort(dep.deposit_amount)}</td>
            <td class="px-6 py-4 text-ink font-mono">${ovBahtShort(dep.remaining_amount)}</td>
            <td class="px-6 py-4">${ovDepositBadge(dep.status)}</td>
            <td class="px-6 py-4 text-ink">${ovEsc(branchName)}</td>
        `;
        return tr;
    };

    // การ์ดมัดจำ — ข้อมูลชุดเดียวกับแถวตาราง
    const ovDepositCardMarkup = (dep) => {
        const card = document.createElement('div');
        card.className = 'elev-card bg-surface-tile-3 rounded-md p-4 transition-all hover:-translate-y-1';
        const t = ovDateParts(dep.createdAt || dep.created_at);
        const branchName = dep.branch_id && dep.branch_id.name ? dep.branch_id.name : '-';

        card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="font-mono font-semibold text-accent-ink truncate">${ovEsc(dep.deposit_number)}</p>
                    <p class="text-xs text-ink/70 mt-0.5 font-mono">${t.date} ${t.time}</p>
                </div>
                <div class="shrink-0">${ovDepositBadge(dep.status)}</div>
            </div>

            <div class="mt-3 pt-3 border-t border-hairline">
                <p class="font-medium text-ink truncate">${ovEsc(dep.customer_name)}</p>
                <p class="text-xs text-ink/70 mt-0.5 font-mono">${ovEsc(dep.customer_phone || '-')}</p>
            </div>

            <div class="mt-3">
                <p class="text-[10px] text-ink/60 uppercase tracking-wide">สินค้า / สาขา</p>
                <p class="text-sm text-ink mt-1 truncate">${ovEsc(dep.product_name || '-')}</p>
                <p class="text-xs text-ink/70">${ovEsc(branchName)}</p>
            </div>

            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline gap-2">
                <div>
                    <p class="text-[10px] text-ink/60 uppercase tracking-wide">มัดจำ</p>
                    <p class="text-base font-mono font-bold text-ink">${ovBahtShort(dep.deposit_amount)}</p>
                </div>
                <div class="text-right">
                    <p class="text-[10px] text-ink/60 uppercase tracking-wide">คงเหลือ</p>
                    <p class="text-sm font-mono text-ink/70">${ovBahtShort(dep.remaining_amount)}</p>
                </div>
            </div>
        `;
        return card;
    };

    const renderOvDepositResults = () => {
        if (!ovDepositTableBody) return;

        if (ovDepositsListWrap) ovDepositsListWrap.classList.toggle('hidden', ovViewMode !== 'list');
        if (ovDepositsCardsWrap) ovDepositsCardsWrap.classList.toggle('hidden', ovViewMode !== 'card');

        if (ovDepositCache.length === 0) {
            ovDepositTableBody.innerHTML = ovDepositStateRow('ไม่พบรายการมัดจำตามตัวเลือก');
            if (ovDepositsCardsWrap) ovDepositsCardsWrap.innerHTML = '<div class="col-span-full py-12 text-center text-ink/50 italic">ไม่พบรายการมัดจำตามตัวเลือก</div>';
            if (ovDepositResultCount) ovDepositResultCount.textContent = '';
            return;
        }

        const frag = document.createDocumentFragment();
        if (ovViewMode === 'card') {
            ovDepositCache.forEach(dep => frag.appendChild(ovDepositCardMarkup(dep)));
            ovDepositsCardsWrap.innerHTML = '';
            ovDepositsCardsWrap.appendChild(frag);
        } else {
            ovDepositCache.forEach(dep => frag.appendChild(ovDepositRowMarkup(dep)));
            ovDepositTableBody.innerHTML = '';
            ovDepositTableBody.appendChild(frag);
        }
        if (ovDepositResultCount) ovDepositResultCount.textContent = `แสดง ${ovDepositCache.length} รายการ`;
    };

    async function loadOvDeposits() {
        if (!ovDepositTableBody) return;
        if (ovDepositResultCount) ovDepositResultCount.textContent = '';
        if (ovViewMode === 'card') renderOvCardSkeleton(8, ovDepositsCardsWrap);
        else renderDepositSkeleton();

        try {
            const params = new URLSearchParams();
            const term = ovDepositSearch && ovDepositSearch.value.trim();
            if (term) params.append('search', term);
            if (ovDepositStatus && ovDepositStatus.value) params.append('status', ovDepositStatus.value);
            if (ovDepositBranch && ovDepositBranch.value) params.append('branch_id', ovDepositBranch.value);

            const response = await authFetch(`${API_BASE_URL}/deposits?${params.toString()}`);
            const result = await response.json();

            if (!result.success) {
                ovDepositTableBody.innerHTML = ovDepositStateRow(ovEsc(result.message || 'ไม่สามารถโหลดข้อมูลได้'), 'text-red-400');
                return;
            }

            ovDepositCache = Array.isArray(result.data) ? result.data : [];
            ovDepositsLoaded = true;
            renderOvDepositResults();
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error loading deposits:', err);
            ovDepositTableBody.innerHTML = ovDepositStateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
        }
    }

    // ==========================================
    // แท็บประวัติค่าใช้จ่าย
    // ==========================================
    const ovExpenseStateRow = (message, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${OV_EXPENSE_COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    const renderExpenseSkeleton = (rowCount = 6) => {
        if (!ovExpenseTableBody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `
                <tr>
                    <td class="px-6 py-4">${bar('w-32')}</td>
                    <td class="px-6 py-4">${bar('w-28')}</td>
                    <td class="px-6 py-4">${bar('w-48')}</td>
                    <td class="px-6 py-4">${bar('w-28 h-6')}</td>
                    <td class="px-6 py-4"><div class="flex justify-end">${bar('w-20')}</div></td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4">${bar('w-24')}</td>
                </tr>
            `;
        }
        ovExpenseTableBody.innerHTML = html;
    };

    // ป้ายประเภทค่าใช้จ่าย — เป็น "ป้ายหมวดหมู่" ไม่ใช่ป้ายสถานะ จึงใช้พื้นเทาทั้งสองแบบ (DESIGN.md ข้อ 11.6)
    // "ทำใบสัญญา" ต่อท้ายด้วยชื่อไฟแนนซ์ เพราะนั่นคือสิ่งที่ฝ่ายบัญชีต้องเห็นคู่กันเสมอ
    const ovExpenseCategoryBadge = (exp) => {
        const label = exp.category === 'ทำใบสัญญา'
            ? `ทำใบสัญญา${exp.finance_company_name ? ` · ${exp.finance_company_name}` : ''}`
            : 'อื่นๆ';
        return `
            <span class="inline-flex items-center px-2.5 py-1 rounded-[0.375rem] bg-surface-chip text-ink text-xs font-medium">
                ${ovEsc(label)}
            </span>
        `;
    };

    const ovExpenseRowMarkup = (exp) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-divider transition-colors';
        const t = ovDateParts(exp.expense_date);

        tr.innerHTML = `
            <td class="px-6 py-4 text-ink">
                <span class="font-mono">${t.date}</span>
                <span class="font-mono text-ink/70 ml-2">${t.time}</span>
            </td>
            <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${ovEsc(exp.expense_number)}</span></td>
            <td class="px-6 py-4 text-ink">
                <div class="max-w-[420px] truncate" title="${ovEsc(exp.description)}">${ovEsc(exp.description)}</div>
            </td>
            <td class="px-6 py-4">${ovExpenseCategoryBadge(exp)}</td>
            <td class="px-6 py-4 text-ink font-mono text-right">${ovBaht(exp.amount)}</td>
            <td class="px-6 py-4 text-ink">${ovEsc(exp.branch_name || '-')}</td>
            <td class="px-6 py-4 text-ink">${ovEsc(exp.created_by_name || '-')}</td>
        `;
        return tr;
    };

    const ovExpenseCardMarkup = (exp) => {
        const card = document.createElement('div');
        card.className = 'elev-card bg-surface-tile-3 rounded-md p-4 transition-all hover:-translate-y-1';
        const t = ovDateParts(exp.expense_date);

        card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="font-mono font-semibold text-accent-ink truncate">${ovEsc(exp.expense_number)}</p>
                    <p class="text-xs text-ink/70 mt-0.5 font-mono">${t.date} ${t.time}</p>
                </div>
                <div class="shrink-0">${ovExpenseCategoryBadge(exp)}</div>
            </div>

            <div class="mt-3 pt-3 border-t border-hairline">
                <p class="text-[10px] text-ink/60 uppercase tracking-wide">รายการ</p>
                <p class="text-sm text-ink mt-1">${ovEsc(exp.description)}</p>
            </div>

            <div class="mt-3">
                <p class="text-[10px] text-ink/60 uppercase tracking-wide">สาขา / ผู้บันทึก</p>
                <p class="text-sm text-ink mt-1 truncate">${ovEsc(exp.branch_name || '-')}</p>
                <p class="text-xs text-ink/70 truncate">${ovEsc(exp.created_by_name || '-')}</p>
            </div>

            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline gap-2">
                <span class="text-xs text-body-muted">จำนวนเงิน</span>
                <span class="text-base font-mono font-bold text-ink">${ovBaht(exp.amount)}</span>
            </div>
        `;
        return card;
    };

    const renderOvExpenseResults = () => {
        if (!ovExpenseTableBody) return;

        if (ovExpensesListWrap) ovExpensesListWrap.classList.toggle('hidden', ovViewMode !== 'list');
        if (ovExpensesCardsWrap) ovExpensesCardsWrap.classList.toggle('hidden', ovViewMode !== 'card');

        // ยอดรวมคิดจากชุดที่แสดงอยู่จริง เพื่อให้ตรงกับตัวกรองที่ผู้ใช้เลือกไว้เสมอ
        const total = ovExpenseCache.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        if (ovExpenseTotal) ovExpenseTotal.textContent = ovBahtShort(total);

        if (ovExpenseCache.length === 0) {
            ovExpenseTableBody.innerHTML = ovExpenseStateRow('ยังไม่มีรายการค่าใช้จ่ายตามตัวเลือก');
            if (ovExpensesCardsWrap) ovExpensesCardsWrap.innerHTML = '<div class="col-span-full py-12 text-center text-ink/50 italic">ยังไม่มีรายการค่าใช้จ่ายตามตัวเลือก</div>';
            if (ovExpenseResultCount) ovExpenseResultCount.textContent = '';
            return;
        }

        const frag = document.createDocumentFragment();
        if (ovViewMode === 'card') {
            ovExpenseCache.forEach(exp => frag.appendChild(ovExpenseCardMarkup(exp)));
            ovExpensesCardsWrap.innerHTML = '';
            ovExpensesCardsWrap.appendChild(frag);
        } else {
            ovExpenseCache.forEach(exp => frag.appendChild(ovExpenseRowMarkup(exp)));
            ovExpenseTableBody.innerHTML = '';
            ovExpenseTableBody.appendChild(frag);
        }
        if (ovExpenseResultCount) ovExpenseResultCount.textContent = `แสดง ${ovExpenseCache.length} รายการ`;
    };

    async function loadOvExpenses() {
        if (!ovExpenseTableBody) return;
        if (ovExpenseResultCount) ovExpenseResultCount.textContent = '';
        if (ovViewMode === 'card') renderOvCardSkeleton(8, ovExpensesCardsWrap);
        else renderExpenseSkeleton();

        try {
            const params = new URLSearchParams();
            const term = ovExpenseSearch && ovExpenseSearch.value.trim();
            if (term) params.append('search', term);
            if (ovExpenseCategory && ovExpenseCategory.value) params.append('category', ovExpenseCategory.value);
            if (ovExpenseBranch && ovExpenseBranch.value) params.append('branch_id', ovExpenseBranch.value);

            const response = await authFetch(`${API_BASE_URL}/expenses?${params.toString()}`);
            const result = await response.json();

            if (!result.success) {
                ovExpenseTableBody.innerHTML = ovExpenseStateRow(ovEsc(result.message || 'ไม่สามารถโหลดข้อมูลได้'), 'text-red-400');
                return;
            }

            ovExpenseCache = Array.isArray(result.data) ? result.data : [];
            ovExpensesLoaded = true;
            renderOvExpenseResults();
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error loading expenses:', err);
            ovExpenseTableBody.innerHTML = ovExpenseStateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
        }
    }

    // ==========================================
    // โมดัลเพิ่มค่าใช้จ่าย
    // ==========================================

    // ค่าเริ่มต้นของช่องวัน/เวลา = ตอนนี้ — input[type=datetime-local] รับได้เฉพาะเวลาท้องถิ่นรูป YYYY-MM-DDTHH:mm
    // (toISOString() ใช้ไม่ได้ เพราะแปลงเป็น UTC ทำให้เวลาเพี้ยนไป 7 ชั่วโมง)
    const ovLocalDateTimeValue = (d = new Date()) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    // ช่องไฟแนนซ์โผล่เฉพาะประเภท "ทำใบสัญญา" และต้องปลด required ตอนซ่อน
    // ไม่งั้นฟอร์มจะ submit ไม่ได้เลยโดยที่ผู้ใช้ไม่เห็นว่าติดตรงไหน
    const syncExpenseFinanceField = () => {
        if (!ovExpenseFinanceWrap || !ovExpenseFinanceCompany) return;
        const isContract = ovExpenseCategoryInput && ovExpenseCategoryInput.value === 'ทำใบสัญญา';
        ovExpenseFinanceWrap.classList.toggle('hidden', !isContract);
        ovExpenseFinanceCompany.required = isContract;
        if (!isContract) ovExpenseFinanceCompany.value = '';
    };

    const populateExpenseFinanceCompanies = async () => {
        if (!ovExpenseFinanceCompany) return;
        if (typeof ensureMasterDataLoaded === 'function') await ensureMasterDataLoaded();
        const companies = (window.masterDataCache && window.masterDataCache.financeCompanies) || [];
        const current = ovExpenseFinanceCompany.value;
        ovExpenseFinanceCompany.innerHTML = '<option value="">เลือกบริษัทไฟแนนซ์</option>';
        companies.forEach(c => {
            const option = document.createElement('option');
            option.value = c._id;
            option.textContent = c.name;
            ovExpenseFinanceCompany.appendChild(option);
        });
        if (current) ovExpenseFinanceCompany.value = current;
    };

    const openExpenseModal = () => {
        if (!ovExpenseModal) return;
        if (ovExpenseForm) ovExpenseForm.reset();
        if (ovExpenseDate) ovExpenseDate.value = ovLocalDateTimeValue();
        if (ovExpenseCategoryInput) ovExpenseCategoryInput.value = 'อื่นๆ';
        syncExpenseFinanceField();
        populateExpenseFinanceCompanies();

        ovExpenseModal.classList.remove('opacity-0', 'pointer-events-none');
        const content = ovExpenseModal.querySelector('.modal-content');
        if (content) content.classList.remove('scale-95');
        if (ovExpenseDescription) ovExpenseDescription.focus();
    };

    const closeExpenseModal = () => {
        if (!ovExpenseModal) return;
        ovExpenseModal.classList.add('opacity-0', 'pointer-events-none');
        const content = ovExpenseModal.querySelector('.modal-content');
        if (content) content.classList.add('scale-95');
    };

    async function saveExpense() {
        const description = ovExpenseDescription ? ovExpenseDescription.value.trim() : '';
        const category = ovExpenseCategoryInput ? ovExpenseCategoryInput.value : '';
        const amount = ovExpenseAmount ? Number(ovExpenseAmount.value) : NaN;
        const expenseDate = ovExpenseDate ? ovExpenseDate.value : '';

        if (!expenseDate) {
            showToast('กรุณาเลือกวัน/เวลา', 'error');
            return;
        }
        if (!description) {
            showToast('กรุณากรอกรายการค่าใช้จ่าย', 'error');
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast('จำนวนเงินต้องเป็นตัวเลขมากกว่า 0', 'error');
            return;
        }

        const payload = { expense_date: new Date(expenseDate).toISOString(), description, category, amount };
        if (category === 'ทำใบสัญญา') {
            const companyId = ovExpenseFinanceCompany ? ovExpenseFinanceCompany.value : '';
            if (!companyId) {
                showToast('กรุณาเลือกบริษัทไฟแนนซ์', 'error');
                return;
            }
            payload.finance_company_id = companyId;
        }

        if (btnExpenseSave) btnExpenseSave.disabled = true;
        try {
            const response = await authFetch(`${API_BASE_URL}/expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (!result.success) {
                showToast(result.message || 'บันทึกค่าใช้จ่ายไม่สำเร็จ', 'error');
                return;
            }

            showToast('บันทึกค่าใช้จ่ายแล้ว');
            closeExpenseModal();
            // ปุ่มอยู่บนหัวหน้า จึงกดได้จากทุกแท็บ — อยู่แท็บค่าใช้จ่ายค่อยดึงใหม่ทันที
            // ถ้าอยู่แท็บอื่นแค่ทำเครื่องหมายว่าข้อมูลเก่าแล้ว ให้ไปโหลดตอนสลับมาแทน
            if (ovActiveTab === 'expenses') await loadOvExpenses();
            else ovExpensesLoaded = false;
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error saving expense:', err);
            showToast('เกิดข้อผิดพลาดในการบันทึกค่าใช้จ่าย', 'error');
        } finally {
            if (btnExpenseSave) btnExpenseSave.disabled = false;
        }
    }

    const switchOvTab = (tab) => {
        ovActiveTab = tab;
        const onOrders = tab === 'orders';
        const onDeposits = tab === 'deposits';
        const onExpenses = tab === 'expenses';

        if (ovTabSelect && ovTabSelect.value !== tab) ovTabSelect.value = tab;

        if (ovPanelOrders) ovPanelOrders.classList.toggle('hidden', !onOrders);
        if (ovPanelDeposits) ovPanelDeposits.classList.toggle('hidden', !onDeposits);
        if (ovPanelExpenses) ovPanelExpenses.classList.toggle('hidden', !onExpenses);
        // ใช้ flex ไม่ใช่ block เพราะแถบคอนโทรลเป็น flex-wrap
        if (ovControlsOrders) ovControlsOrders.classList.toggle('hidden', !onOrders);
        if (ovControlsDeposits) ovControlsDeposits.classList.toggle('hidden', !onDeposits);
        if (ovControlsExpenses) ovControlsExpenses.classList.toggle('hidden', !onExpenses);
        closeStatusMenu();

        // โหลดครั้งแรกที่สลับมาเท่านั้น ไม่ดึงซ้ำทุกครั้งที่กดสลับไปมา
        if (onDeposits && !ovDepositsLoaded) loadOvDeposits();
        if (onExpenses && !ovExpensesLoaded) loadOvExpenses();
    };

    async function loadBranchesForOrderVerification() {
        if (!ovBranch) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                [ovBranch, ovDepositBranch, ovExpenseBranch].forEach(select => {
                    if (!select) return;
                    select.innerHTML = '<option value="">เลือกสาขา</option>';
                    result.data.forEach(branch => {
                        const option = document.createElement('option');
                        option.value = branch._id;
                        option.textContent = branch.name;
                        select.appendChild(option);
                    });
                });
            }
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error loading branches:', err);
        }
    }

    async function loadEmployeesForOrderVerification() {
        if (!ovEmployee) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/employees`);
            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                ovEmployee.innerHTML = '<option value="">ทุกคน</option>';
                result.data.forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp._id;
                    option.textContent = emp.name;
                    ovEmployee.appendChild(option);
                });
            }
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error loading employees:', err);
        }
    }

    // กลุ่ม pill ประเภทสินค้า — สร้างจากประเภทที่มีจริงในระบบ ไม่ hardcode รายชื่อ
    // (สัญญาของ pill group อยู่ใน DESIGN.md ข้อ 11.9: ค่าจริงเก็บใน input ที่ data-target ชี้ไป)
    const renderProductTypePills = async () => {
        if (!ovProductTypeContainer) return;
        if (typeof ensureMasterDataLoaded === 'function') await ensureMasterDataLoaded();

        const types = (window.masterDataCache && window.masterDataCache.productTypes) || [];
        const options = [{ name: '' }, ...types];

        ovProductTypeContainer.innerHTML = '';
        options.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.value = t.name || '';
            btn.className = 'flex-shrink-0 px-4 py-2.5 bg-field border rounded-xl text-sm transition-colors filter-pill';
            btn.textContent = t.name || 'ทั้งหมด';
            btn.addEventListener('click', () => {
                // กด pill ที่เลือกอยู่ซ้ำ = กลับไป "ทั้งหมด" (ข้อ 11.9)
                const next = (ovProductType.value === btn.dataset.value) ? '' : btn.dataset.value;
                ovProductType.value = next;
                syncProductTypePills();
                loadOrderVerifications(); // ยิงทันที เหมือนตัวกรองอื่นในพาเนลนี้
            });
            ovProductTypeContainer.appendChild(btn);
        });
        syncProductTypePills();
    };

    // สถานะเลือก = สลับสีขอบ/ตัวอักษร พื้นไม่เปลี่ยน (ข้อ 11.9)
    function syncProductTypePills() {
        if (!ovProductTypeContainer || !ovProductType) return;
        ovProductTypeContainer.querySelectorAll('.filter-pill').forEach(btn => {
            const on = btn.dataset.value === ovProductType.value;
            btn.className = 'flex-shrink-0 px-4 py-2.5 bg-field border rounded-xl text-sm transition-colors filter-pill ' +
                (on ? 'border-accent-ink text-accent-ink' : 'border-line-strong text-body-muted hover:border-accent-ink hover:text-ink');
            btn.setAttribute('aria-pressed', String(on));
        });
    }

    // ==========================================
    // เมนูเลือกสถานะการชำระเงิน
    // ==========================================
    const closeStatusMenu = () => {
        if (!ovStatusMenu) return;
        ovStatusMenu.classList.add('hidden');
        ovMenuTargetId = null;
    };

    const openStatusMenu = (anchorBtn, orderId) => {
        if (!ovStatusMenu) return;
        ovMenuTargetId = orderId;
        const rect = anchorBtn.getBoundingClientRect();
        ovStatusMenu.classList.remove('hidden');
        // จัดตำแหน่งหลังถอด hidden แล้ว ไม่งั้น offsetHeight ยังเป็น 0
        const menuHeight = ovStatusMenu.offsetHeight;
        const spaceBelow = window.innerHeight - rect.bottom;
        const top = spaceBelow < menuHeight + 8 ? rect.top - menuHeight - 6 : rect.bottom + 6;
        ovStatusMenu.style.top = `${Math.max(8, top)}px`;
        ovStatusMenu.style.left = `${Math.min(rect.left, window.innerWidth - ovStatusMenu.offsetWidth - 8)}px`;
    };

    // showConfirm ของระบบนี้รับ callback ไม่ได้คืน Promise — ห้ามเขียนเป็น await
    function updatePaymentStatus(orderId, nextStatus) {
        const row = ovCache.find(r => String(r._id) === String(orderId));
        if (!row || row.payment_status === nextStatus) return;

        showConfirm(
            'ยืนยันเปลี่ยนสถานะการชำระเงิน',
            `เปลี่ยนสถานะบิล <strong>${ovEsc(row.receipt_number)}</strong> จาก "${row.payment_status}" เป็น "${nextStatus}" ใช่ไหม?`,
            () => applyPaymentStatus(orderId, nextStatus)
        );
    }

    async function applyPaymentStatus(orderId, nextStatus) {
        try {
            const response = await authFetch(`${API_BASE_URL}/order-verifications/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_status: nextStatus })
            });
            const result = await response.json();

            if (!result.success) {
                showToast(result.message || 'บันทึกสถานะไม่สำเร็จ', 'error');
                return;
            }

            showToast('บันทึกสถานะการชำระเงินแล้ว');
            // ดึงใหม่ทั้งชุด เพราะยอดค้างชำระถูกคำนวณจากสถานะที่เซิร์ฟเวอร์ ไม่ใช่ที่หน้าเว็บ
            // preserveRendered: คงจำนวนแถวที่เลื่อนดูไว้ ไม่ดีดกลับไปเหลือ 10 แถวแรก
            await loadOrderVerifications({ preserveRendered: true });
            if (ovCurrentOrder && String(ovCurrentOrder._id) === String(orderId)) {
                const fresh = ovCache.find(r => String(r._id) === String(orderId));
                if (fresh) populateOrderDetail(fresh);
            }
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error updating payment status:', err);
            showToast('เกิดข้อผิดพลาดในการบันทึกสถานะ', 'error');
        }
    }

    // พิมพ์ใบเสร็จ — ใช้โมดัลใบเสร็จตัวเดียวกับ POS และหน้าประวัติการขาย
    // ต้องดึงบิลเต็มจาก /transactions/:id ก่อน เพราะ /order-verifications คืนข้อมูลที่จัดรูปใหม่
    // สำหรับหน้านี้โดยเฉพาะ ไม่ใช่เอกสารบิลดิบที่ตัวพิมพ์ใบเสร็จต้องใช้
    async function printOrderReceipt(orderId) {
        try {
            const response = await authFetch(`${API_BASE_URL}/transactions/${orderId}`);
            const result = await response.json();

            if (!result.success || !result.data) {
                showToast(result.message || 'ไม่พบข้อมูลบิลที่จะพิมพ์', 'error');
                return;
            }
            if (typeof openCheckoutSuccessModal !== 'function') {
                showToast('ไม่พบตัวพิมพ์ใบเสร็จ', 'error');
                return;
            }
            openCheckoutSuccessModal(result.data);
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error printing receipt:', err);
            showToast('เกิดข้อผิดพลาดในการเปิดใบเสร็จ', 'error');
        }
    }

    // ==========================================
    // โมดัลรายละเอียดออเดอร์ (ปุ่มไอคอนรูปตา)
    // ==========================================
    const ovSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    const populateOrderDetail = (row) => {
        ovCurrentOrder = row;
        const f = row.finance || {};

        ovSetText('order-detail-receipt', row.receipt_number || '');
        ovSetText('order-detail-date', ovDateTimeText(row.created_at));
        ovSetText('order-detail-branch', row.branch_name || '-');
        ovSetText('order-detail-employee', row.employee_name || '-');
        ovSetText('order-detail-sale-type', ovSaleTypeText(row));

        // รูปแบบการชำระเงินของลูกค้า — แสดงเฉพาะช่องทางที่มีเงินเข้าจริง
        const payParts = [];
        if (row.cash_amount > 0) payParts.push(`เงินสด ${ovBahtShort(row.cash_amount)}`);
        if (row.transfer_amount > 0) payParts.push(`เงินโอน ${ovBahtShort(row.transfer_amount)}`);
        if (row.applied_deposit_amount > 0) payParts.push(`หักมัดจำ ${ovBahtShort(row.applied_deposit_amount)}`);
        ovSetText('order-detail-customer-payment', payParts.length ? payParts.join(' · ') : '-');

        const itemsBox = document.getElementById('order-detail-items');
        if (itemsBox) {
            itemsBox.innerHTML = (row.items || []).map(it => {
                const dot = window.productColorDot ? window.productColorDot(it.color_name) : '';
                const sub = it.imei_sold
                    ? `IMEI : ${ovEsc(it.imei_sold)}`
                    : (it.product_code ? `รหัส : ${ovEsc(it.product_code)}` : '');
                const price = it.is_gift
                    ? '<span class="text-amber-400 font-bold">ของแถม</span>'
                    : `<span class="font-mono">${ovBahtShort(it.price * it.quantity)}</span>`;
                return `
                    <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                            <p class="flex items-center gap-2">${dot}<span>${ovEsc(it.product_name)}</span>
                                ${it.quantity > 1 ? `<span class="text-xs text-ink/70">× ${it.quantity}</span>` : ''}</p>
                            ${sub ? `<p class="text-xs text-ink/70 mt-0.5">${sub}</p>` : ''}
                        </div>
                        <div class="text-right shrink-0">${price}</div>
                    </div>
                `;
            }).join('') || '<p class="text-ink/50 italic">ไม่มีรายการสินค้า</p>';
        }

        ovSetText('order-detail-contract-fee', ovBaht(f.contract_fee));
        ovSetText('order-detail-icloud-fee', ovBaht(f.icloud_fee));
        ovSetText('order-detail-down', ovBaht(f.down_payment));
        ovSetText('order-detail-received-total', ovBaht(f.received_total));

        // บิลซื้อสดไม่มีเงินดาวน์ และเงินรับรวมคือยอดทั้งบิล ไม่ใช่สูตรของฝั่งไฟแนนซ์
        const downRow = document.getElementById('order-detail-down-row');
        if (downRow) downRow.classList.toggle('hidden', !row.is_financing);
        ovSetText('order-detail-received-caption', row.is_financing
            ? '(ดาวน์ + ค่าใบสัญญา + ค่าระบบ)'
            : '(ยอดที่เก็บจากลูกค้าทั้งบิล)');

        const financeBlock = document.getElementById('order-detail-finance-block');
        if (financeBlock) financeBlock.classList.toggle('hidden', !row.is_financing);

        if (row.is_financing) {
            ovSetText('order-detail-finance-company', row.finance_company_name || '-');
            ovSetText('order-detail-full-price', ovBaht(f.full_price));
            ovSetText('order-detail-down-percent', `${(Number(f.down_percent) || 0).toFixed(2)}%`);
            ovSetText('order-detail-hire-purchase', ovBaht(f.hire_purchase));
            // บิลคละประเภทสินค้าได้เรตไม่เท่ากัน ตัวเลขที่โชว์จึงเป็นเรตเฉลี่ยถ่วงน้ำหนัก — บอกให้ชัดว่าเป็นค่าเฉลี่ย
            const rateText = ovRate(f.commission_rate);
            ovSetText('order-detail-commission-rate', f.commission_mixed
                ? `(เฉลี่ย ${rateText}% ของทุนเช่าซื้อ)`
                : `(${rateText}% ของทุนเช่าซื้อ)`);
            ovSetText('order-detail-commission', ovBaht(f.commission));

            const breakdown = document.getElementById('order-detail-commission-breakdown');
            if (breakdown) {
                breakdown.classList.toggle('hidden', !f.commission_mixed);
                breakdown.innerHTML = f.commission_mixed
                    ? (f.commission_lines || []).map(l => `
                        <div class="flex justify-between gap-4">
                            <span>${ovEsc(l.product_name)}${l.type_name ? ` <span class="text-ink/40">(${ovEsc(l.type_name)})</span>` : ''} · ${ovRate(l.commission_rate)}%</span>
                            <span class="font-mono">${ovBaht(l.commission)}</span>
                        </div>
                    `).join('')
                    : '';
            }
            ovSetText('order-detail-credit', ovBaht(f.credit_amount));
            ovSetText('order-detail-outstanding', ovBaht(f.outstanding));
            ovSetText('order-detail-paid-at', row.finance_paid_at ? ovDateTimeText(row.finance_paid_at) : 'ยังไม่ชำระ');
        }

        ovSetText('order-detail-revenue', ovBaht(f.silmin_revenue));

        if (ovDetailNote) ovDetailNote.value = row.verify_note || '';
        if (ovDetailPaymentStatus) ovDetailPaymentStatus.value = row.payment_status || 'ยังไม่ชำระ';
        if (ovDetailVerifyStatus) ovDetailVerifyStatus.value = row.verify_status || 'รอตรวจสอบ';

        // บิลที่ถูกยกเลิกแล้วห้ามแก้อะไรทั้งนั้น (เซิร์ฟเวอร์ก็ปฏิเสธซ้ำอีกชั้น)
        const cancelled = row.status === 'ยกเลิกแล้ว';
        [ovDetailPaymentStatus, ovDetailVerifyStatus, ovDetailNote, ovDetailDownInput, btnOvDetailSave].forEach(el => {
            if (el) el.disabled = cancelled;
        });

        // ราคาดาวน์มีความหมายเฉพาะบิลผ่อน บิลซื้อสดจึงซ่อนช่องนี้ไปเลย
        const downWrap = document.getElementById('order-detail-down-input-wrap');
        if (downWrap) downWrap.classList.toggle('hidden', !row.is_financing);
        if (ovDetailDownInput) ovDetailDownInput.value = Number(f.down_payment) || 0;

        // ราคาเครื่องแก้ได้เฉพาะบิลที่มีเครื่องรายการเดียว (เซิร์ฟเวอร์เป็นคนบอกมา)
        const priceEditable = !cancelled && row.device_item_count === 1;
        if (ovDetailDevicePrice) {
            ovDetailDevicePrice.value = row.device_unit_price != null ? row.device_unit_price : (f.full_price || 0);
            ovDetailDevicePrice.disabled = !priceEditable;
        }
        const priceHint = document.getElementById('order-detail-device-price-hint');
        if (priceHint) {
            let hint = '';
            if (!cancelled && row.device_item_count === 0) hint = 'บิลนี้ไม่มีรายการเครื่อง';
            else if (!cancelled && row.device_item_count > 1) hint = `บิลนี้มีเครื่อง ${row.device_item_count} รายการ แก้ราคาที่นี่ไม่ได้`;
            priceHint.textContent = hint;
            priceHint.classList.toggle('hidden', !hint);
        }
    };

    const openOrderDetailModal = () => {
        if (!ovDetailModal) return;
        ovDetailModal.classList.remove('opacity-0', 'pointer-events-none');
        const content = ovDetailModal.querySelector('.modal-content');
        if (content) content.classList.remove('scale-95');
    };

    const closeOrderDetailModal = () => {
        if (!ovDetailModal) return;
        ovDetailModal.classList.add('opacity-0', 'pointer-events-none');
        const content = ovDetailModal.querySelector('.modal-content');
        if (content) content.classList.add('scale-95');
        ovCurrentOrder = null;
    };

    // บันทึกทั้งสองสถานะ + หมายเหตุ ในคำขอเดียว — ถ้าไม่มีอะไรเปลี่ยนก็แค่ปิดหน้าต่าง
    async function saveOrderDetail() {
        if (!ovCurrentOrder) return;

        const note = ovDetailNote ? ovDetailNote.value.trim() : '';
        const paymentStatus = ovDetailPaymentStatus ? ovDetailPaymentStatus.value : '';
        const verifyStatus = ovDetailVerifyStatus ? ovDetailVerifyStatus.value : '';

        const payload = {};
        if (paymentStatus && paymentStatus !== ovCurrentOrder.payment_status) payload.payment_status = paymentStatus;
        if (verifyStatus && verifyStatus !== ovCurrentOrder.verify_status) payload.verify_status = verifyStatus;
        if (note !== (ovCurrentOrder.verify_note || '')) payload.verify_note = note;

        const f = ovCurrentOrder.finance || {};
        if (ovDetailDevicePrice && !ovDetailDevicePrice.disabled) {
            const price = Number(ovDetailDevicePrice.value);
            if (!Number.isFinite(price) || price < 0) {
                showToast('ราคาเครื่องต้องเป็นตัวเลขไม่ติดลบ', 'error');
                return;
            }
            if (price !== Number(ovCurrentOrder.device_unit_price)) payload.device_price = price;
        }
        if (ovDetailDownInput && ovCurrentOrder.is_financing && !ovDetailDownInput.disabled) {
            const down = Number(ovDetailDownInput.value);
            if (!Number.isFinite(down) || down < 0) {
                showToast('ราคาดาวน์ต้องเป็นตัวเลขไม่ติดลบ', 'error');
                return;
            }
            if (down !== Number(f.down_payment)) payload.down_payment = down;
        }

        if (Object.keys(payload).length === 0) {
            closeOrderDetailModal();
            return;
        }

        try {
            const response = await authFetch(`${API_BASE_URL}/order-verifications/${ovCurrentOrder._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (!result.success) {
                showToast(result.message || 'บันทึกไม่สำเร็จ', 'error');
                return;
            }

            showToast('บันทึกข้อมูลการตรวจสอบแล้ว');
            closeOrderDetailModal();
            // ดึงใหม่ทั้งชุด เพราะยอดค้างชำระถูกคำนวณจากสถานะที่เซิร์ฟเวอร์ ไม่ใช่ที่หน้าเว็บ
            // preserveRendered: คงจำนวนแถวที่เลื่อนดูไว้ ไม่ดีดกลับไปเหลือ 10 แถวแรก
            await loadOrderVerifications({ preserveRendered: true });
        } catch (err) {
            console.error('[ORDER-VERIFICATION] Error saving order detail:', err);
            showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
        }
    }

    // ==========================================
    // พาเนลกรองละเอียด — เปิด/ปิดสองชั้นเหมือนหน้าอื่น (ข้อ 11.8)
    // ==========================================
    const openOvFilterPanel = () => {
        if (!ovFilterPanel) return;
        ovFilterPanel.classList.remove('opacity-0', 'pointer-events-none');
        if (ovFilterPanelContent) ovFilterPanelContent.classList.remove('translate-x-full');
    };

    const closeOvFilterPanel = () => {
        if (!ovFilterPanel) return;
        ovFilterPanel.classList.add('opacity-0', 'pointer-events-none');
        if (ovFilterPanelContent) ovFilterPanelContent.classList.add('translate-x-full');
    };

    // ==========================================
    // ผูก event
    // ==========================================
    if (ovSearch) {
        let searchTimeout;
        ovSearch.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(loadOrderVerifications, 500);
        });
    }
    if (ovStatus) ovStatus.addEventListener('change', loadOrderVerifications);
    if (ovBranch) ovBranch.addEventListener('change', loadOrderVerifications);

    // ทั้งสองแท็บใช้โหมดเดียวกัน กดที่ปุ่มคู่ไหนก็เปลี่ยนพร้อมกัน
    const applyOvViewMode = (mode) => {
        ovViewMode = mode;
        localStorage.setItem('order_verification_view_mode', mode);
        window.syncViewToggleButtons(ovViewListBtn, ovViewCardBtn, mode);
        window.syncViewToggleButtons(ovDepositViewListBtn, ovDepositViewCardBtn, mode);
        window.syncViewToggleButtons(ovExpenseViewListBtn, ovExpenseViewCardBtn, mode);
        // คงจำนวนแถวที่โหลดไว้ตอนสลับ list/card ไม่ให้ที่เลื่อนดูมาหายไป
        renderOvResults(ovRenderedCount);
        if (ovDepositsLoaded) renderOvDepositResults();
        if (ovExpensesLoaded) renderOvExpenseResults();
    };

    if (ovViewListBtn) ovViewListBtn.addEventListener('click', () => applyOvViewMode('list'));
    if (ovViewCardBtn) ovViewCardBtn.addEventListener('click', () => applyOvViewMode('card'));
    if (ovDepositViewListBtn) ovDepositViewListBtn.addEventListener('click', () => applyOvViewMode('list'));
    if (ovDepositViewCardBtn) ovDepositViewCardBtn.addEventListener('click', () => applyOvViewMode('card'));
    if (ovExpenseViewListBtn) ovExpenseViewListBtn.addEventListener('click', () => applyOvViewMode('list'));
    if (ovExpenseViewCardBtn) ovExpenseViewCardBtn.addEventListener('click', () => applyOvViewMode('card'));

    // ซิงก์ปุ่มให้ตรงกับโหมดที่จำไว้ตั้งแต่โหลดสคริปต์ครั้งแรก
    window.syncViewToggleButtons(ovViewListBtn, ovViewCardBtn, ovViewMode);
    window.syncViewToggleButtons(ovDepositViewListBtn, ovDepositViewCardBtn, ovViewMode);
    window.syncViewToggleButtons(ovExpenseViewListBtn, ovExpenseViewCardBtn, ovViewMode);
    if (ovOrdersListWrap) ovOrdersListWrap.classList.toggle('hidden', ovViewMode !== 'list');
    if (ovOrdersCardsWrap) ovOrdersCardsWrap.classList.toggle('hidden', ovViewMode !== 'card');
    if (ovDepositsListWrap) ovDepositsListWrap.classList.toggle('hidden', ovViewMode !== 'list');
    if (ovDepositsCardsWrap) ovDepositsCardsWrap.classList.toggle('hidden', ovViewMode !== 'card');
    if (ovExpensesListWrap) ovExpensesListWrap.classList.toggle('hidden', ovViewMode !== 'list');
    if (ovExpensesCardsWrap) ovExpensesCardsWrap.classList.toggle('hidden', ovViewMode !== 'card');

    if (ovTabSelect) {
        ovTabSelect.addEventListener('change', () => {
            if (ovTabSelect.value !== ovActiveTab) switchOvTab(ovTabSelect.value);
        });
    }
    if (ovDepositSearch) {
        let depositTimeout;
        ovDepositSearch.addEventListener('input', () => {
            clearTimeout(depositTimeout);
            depositTimeout = setTimeout(loadOvDeposits, 500);
        });
    }
    if (ovDepositStatus) ovDepositStatus.addEventListener('change', loadOvDeposits);
    if (ovDepositBranch) ovDepositBranch.addEventListener('change', loadOvDeposits);

    if (ovExpenseSearch) {
        let expenseTimeout;
        ovExpenseSearch.addEventListener('input', () => {
            clearTimeout(expenseTimeout);
            expenseTimeout = setTimeout(loadOvExpenses, 500);
        });
    }
    if (ovExpenseCategory) ovExpenseCategory.addEventListener('change', loadOvExpenses);
    if (ovExpenseBranch) ovExpenseBranch.addEventListener('change', loadOvExpenses);

    if (btnAddExpense) btnAddExpense.addEventListener('click', openExpenseModal);
    if (btnExpenseClose) btnExpenseClose.addEventListener('click', closeExpenseModal);
    if (btnExpenseCancel) btnExpenseCancel.addEventListener('click', closeExpenseModal);
    if (ovExpenseCategoryInput) ovExpenseCategoryInput.addEventListener('change', syncExpenseFinanceField);
    if (ovExpenseForm) {
        ovExpenseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveExpense();
        });
    }
    if (ovExpenseModal) {
        ovExpenseModal.addEventListener('click', (e) => {
            if (e.target === ovExpenseModal) closeExpenseModal();
        });
    }

    // ตัวกรองใน drawer ยิงทันทีที่เปลี่ยนค่า ไม่มีปุ่ม "ตกลง"
    // (ต่างจากแบบแปลน #stock ใน DESIGN.md ข้อ 11.8 ที่รอกดยืนยัน — หน้านี้ตั้งใจให้ต่าง)
    // พาเนลไม่ปิดเองหลังเลือก เพื่อให้ปรับหลายตัวต่อกันได้โดยเห็นผลหลังพาเนลไปเรื่อยๆ
    if (btnOvFilter) btnOvFilter.addEventListener('click', openOvFilterPanel);
    if (btnOvFilterClose) btnOvFilterClose.addEventListener('click', closeOvFilterPanel);
    [ovStartDate, ovEndDate, ovEmployee, ovPaymentType].forEach(el => {
        if (el) el.addEventListener('change', () => loadOrderVerifications());
    });
    if (ovFilterPanel) {
        ovFilterPanel.addEventListener('click', (e) => {
            if (e.target === ovFilterPanel) closeOvFilterPanel();
        });
    }

    // แถว/การ์ดถูกสร้างใหม่ทุกครั้งที่โหลด จึงดักที่กล่องครอบครั้งเดียวแทนการผูกทีละปุ่ม
    const onOrderRowClick = (e) => {
        const statusBtn = e.target.closest('[data-status-toggle]');
        if (statusBtn) {
            e.stopPropagation();
            const id = statusBtn.dataset.statusToggle;
            if (ovMenuTargetId === id) closeStatusMenu();
            else openStatusMenu(statusBtn, id);
            return;
        }

        const printBtn = e.target.closest('[data-print]');
        if (printBtn) {
            printOrderReceipt(printBtn.dataset.print);
            return;
        }

        const detailBtn = e.target.closest('[data-detail]');
        if (detailBtn) {
            const row = ovCache.find(r => String(r._id) === String(detailBtn.dataset.detail));
            if (row) {
                populateOrderDetail(row);
                openOrderDetailModal();
            }
        }
    };

    if (ovTableBody) ovTableBody.addEventListener('click', onOrderRowClick);
    if (ovOrdersCardsWrap) ovOrdersCardsWrap.addEventListener('click', onOrderRowClick);

    if (ovStatusMenu) {
        ovStatusMenu.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-status]');
            if (!btn || !ovMenuTargetId) return;
            const targetId = ovMenuTargetId;
            closeStatusMenu();
            updatePaymentStatus(targetId, btn.dataset.status);
        });
    }

    // ปิดเมนูเมื่อคลิกที่อื่น / เลื่อนจอ / กด Esc
    document.addEventListener('click', (e) => {
        if (!ovStatusMenu || ovStatusMenu.classList.contains('hidden')) return;
        if (e.target.closest('#order-verification-status-menu')) return;
        if (e.target.closest('[data-status-toggle]')) return;
        closeStatusMenu();
    });
    window.addEventListener('scroll', closeStatusMenu, true);
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeStatusMenu();
        if (ovDetailModal && !ovDetailModal.classList.contains('pointer-events-none')) closeOrderDetailModal();
        if (ovExpenseModal && !ovExpenseModal.classList.contains('pointer-events-none')) closeExpenseModal();
        if (ovFilterPanel && !ovFilterPanel.classList.contains('pointer-events-none')) closeOvFilterPanel();
    });

    if (btnOvDetailClose) btnOvDetailClose.addEventListener('click', closeOrderDetailModal);
    if (ovDetailModal) {
        ovDetailModal.addEventListener('click', (e) => {
            if (e.target === ovDetailModal) closeOrderDetailModal();
        });
    }
    if (btnOvDetailSave) btnOvDetailSave.addEventListener('click', saveOrderDetail);
    if (btnOvDetailCancel) btnOvDetailCancel.addEventListener('click', closeOrderDetailModal);

    // เรียกจาก switchView ตอนเข้าหน้า — โหลดตัวเลือกของตัวกรองให้พร้อมก่อนดึงรายการ
    async function initOrderVerification() {
        // เข้าหน้าใหม่ทุกครั้งเริ่มที่แท็บออเดอร์เสมอ และล้างสถานะโหลดของอีกสองแท็บ
        // เพื่อไม่ให้เห็นข้อมูลค้างจากรอบก่อน
        ovDepositsLoaded = false;
        ovExpensesLoaded = false;
        if (ovTabSelect) ovTabSelect.value = 'orders';
        switchOvTab('orders');
        await Promise.all([
            loadBranchesForOrderVerification(),
            loadEmployeesForOrderVerification(),
            renderProductTypePills()
        ]);
        await loadOrderVerifications();
    }
    window.initOrderVerification = initOrderVerification;
})();
